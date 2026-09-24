#!/usr/bin/env python3
"""Opt-in low-brightness Air75 test. Restores original state in finally.
Run only when the application and other HID clients have released the keyboard.
"""
import argparse
import json
import os
import select
import statistics
import subprocess
import time
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--binary', default=str(Path(__file__).resolve().parent.parent / 'bin/HIDBridge'))
parser.add_argument('--run', action='store_true', help='explicitly run reversible lighting changes on the attached keyboard')
parser.add_argument('--backup', default='/tmp/air75-studio-hardware-qa-20260910.json')
parser.add_argument('--output', default=str(Path(__file__).with_name('hardware-qa-results.json')))
args = parser.parse_args()
if not args.run:
    parser.error('This script changes lighting temporarily; pass --run to execute it.')
if Path(args.backup).exists():
    parser.error('Existing backup found. Restore/review it before starting a new QA run.')

binary = args.binary
records = []
summary = {'startedAt': time.strftime('%Y-%m-%dT%H:%M:%S%z'), 'binary': binary}
counter = 0

def start():
    return subprocess.Popen([binary, '--backup', args.backup], stdin=subprocess.PIPE,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, bufsize=1)

def send(process, op, **fields):
    global counter
    counter += 1
    command = {'id': counter, 'op': op, **fields}
    started = time.monotonic()
    process.stdin.write(json.dumps(command) + '\n')
    process.stdin.flush()
    while True:
        ready, _, _ = select.select([process.stdout], [], [], 20)
        if not ready:
            raise RuntimeError('Response timed out: ' + op)
        line = process.stdout.readline()
        if not line:
            raise RuntimeError('Helper exited during ' + op)
        reply = json.loads(line)
        if reply.get('id') == counter:
            elapsed = (time.monotonic() - started) * 1000
            records.append({'op': op, 'elapsedMs': round(elapsed, 3), 'reply': reply})
            if not reply['ok']:
                raise RuntimeError(json.dumps(reply['error']))
            return reply['result'], elapsed
        records.append({'event': reply})

def close(process):
    if process.stdin and not process.stdin.closed:
        process.stdin.close()
    process.wait(timeout=20)
    tail = process.stdout.read()
    for line in tail.splitlines():
        records.append({'event': json.loads(line)})
    error = process.stderr.read()
    if error:
        records.append({'stderr': error})

p = start()
baseline = None
try:
    result, _ = send(p, 'connect')
    baseline = result['state']
    summary['identity'] = result
    send(p, 'readColors')
    result, _ = send(p, 'arm')
    assert result['state'][0] == 21 and result['state'][1] == 100
    assert Path(args.backup).exists()
    summary['backupPresentBeforePaint'] = True

    colors = ['#%02x%02x%02x' % (((i * 7) % 31) + 1, ((i * 11) % 31) + 1, ((i * 13) % 31) + 1) for i in range(84)]
    result, duration = send(p, 'paint', colors=colors, verify=True)
    actual, _ = send(p, 'readColors')
    assert actual['colors'][:84] == colors, '84-key D2 mismatch'
    summary['all84EntriesExactAtHardwareBrightness100'] = True
    summary['fullPaintAndReadbackMs'] = duration
    summary['maximumTestRGBChannel'] = 31

    result, _ = send(p, 'side', color='#204010', brightness=20)
    expected_main = baseline[:9]
    expected_main[0], expected_main[1], expected_main[4] = 21, 100, 1
    assert result['state'][:9] == expected_main
    side, _ = send(p, 'readColors')
    summary['sideAt20Percent'] = side['colors'][84:]
    result, _ = send(p, 'side', restore=True)
    assert result['state'][9:] == baseline[9:]
    assert result['state'][0] == 21 and result['state'][1] == 100
    summary['sideOnlyRestorePreservedMainCustomMode'] = True

    latencies = []
    for frame in range(20):
        colors = ['#000000'] * 84
        for i in range(8):
            colors[(frame + i) % 84] = '#081810'
        result, duration = send(p, 'paint', colors=colors)
        latencies.append(duration)
    actual, _ = send(p, 'readColors')
    assert actual['colors'][:84] == colors
    summary['streamFrames'] = 20
    summary['streamFrameMedianMs'] = statistics.median(latencies)
    summary['streamFrameMaxMs'] = max(latencies)
    summary['serialRequestThroughputFPS'] = 1000 / statistics.mean(latencies)
    result, _ = send(p, 'restore')
    assert result['verified'] and result['state'] == baseline
    status, _ = send(p, 'status')
    assert status['state'] == baseline
    assert not Path(args.backup).exists()
    summary['explicitRestoreAll17BytesExact'] = True
    send(p, 'disconnect')
    close(p)

    # An actual process-termination recovery check, without keyboard remapping.
    p = start()
    send(p, 'connect')
    send(p, 'arm')
    send(p, 'paint', colors=['#000810'] * 84, verify=True)
    p.terminate()
    p.wait(timeout=20)
    close(p)
    assert p.returncode == 0
    assert not Path(args.backup).exists()
    p = start()
    result, _ = send(p, 'connect')
    assert result['state'] == baseline
    summary['sigtermRestorationVerifiedByFreshProcess'] = True
    send(p, 'disconnect')
    summary['passed'] = True
except Exception as error:
    summary['passed'] = False
    summary['failure'] = str(error)
    raise
finally:
    if p.poll() is None:
        if baseline is not None:
            try:
                result, _ = send(p, 'restore')
                summary['finallyRestore'] = result
            except Exception as error:
                summary['finallyRestoreError'] = str(error)
        close(p)
    summary['backupRemaining'] = Path(args.backup).exists()
    Path(args.output).write_text(json.dumps({'summary': summary, 'transactions': records}, indent=2) + '\n')
    print(json.dumps(summary, indent=2))

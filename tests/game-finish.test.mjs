import test from 'node:test';
import assert from 'node:assert/strict';
import { GameSession } from '../server/games.mjs';
import { layout } from '../shared/layout.mjs';

const mapped = new Set(layout.map(key => key.index));
const expectRed = game => game.render().forEach((color, index) =>
  assert.equal(color, mapped.has(index) ? '#ff0000' : '#000000', `LED ${index}`));
const expectBlack = game => assert.ok(game.render().every(color => color === '#000000'));
function lose(game, type) {
  game.start(4, type);
  if (type === 'snake') {
    for (let i = 0; i < 40 && game.status === 'running'; i++) game.tick(500);
  } else if (type === 'whack') game.tick(30_000);
  else if (type === 'memory') game.tick(12_000);
  else {
    game.current.rightScore = 6;
    game.current.phase = 'rally';
    game.current.ball = {x: 0.01, y: 0.5, vx: -7, vy: 0};
    game.tick(10);
  }
}

test('every losing round flashes all 83 mapped keys red exactly three times, then stays dark', () => {
  for (const type of ['snake', 'whack', 'memory', 'pong']) {
    const game = new GameSession({}, () => 0);
    lose(game, type);
    assert.equal(game.status, type === 'pong' ? 'won' : 'over', type);
    const score = game.snapshot().score;
    expectRed(game);
    for (let half = 1; half <= 6; half++) {
      game.tick(300);
      if (half < 6 && half % 2 === 0) expectRed(game);
      else expectBlack(game);
    }
    assert.equal(game.flashing, false);
    game.tick(100_000);
    expectBlack(game);
    assert.equal(game.snapshot().score, score);
  }
});

test('wrong memory input starts immediate feedback; restart cancels it and retains speed and records', () => {
  const game = new GameSession({memory: 9}, () => 0);
  game.start(7, 'memory');
  game.tick(500 + game.current.cueMs + 240);
  assert.equal(game.current.phase, 'input');
  game.input({code:'KeyS'});
  expectRed(game);
  game.tick(300);
  expectBlack(game);
  game.start(game.speed);
  assert.equal(game.type, 'memory');
  assert.equal(game.speed, 7);
  assert.equal(game.bestScore, 9);
  assert.equal(game.flashing, false);
  assert.equal(game.snapshot().round, 1);
  game.tick(1800);
  assert.equal(game.status, 'running');
  assert.equal(game.flashing, false);
  assert.ok(game.render().filter(c => c !== '#000000').length <= 1);
});

test('invalid time, successful solo completion, stopped and newly selected games never produce a loss flash', () => {
  const game = new GameSession({}, () => 0);
  lose(game, 'snake');
  for (const dt of [-1, 0, NaN, Infinity]) game.tick(dt);
  expectRed(game);
  game.status = 'idle';
  assert.equal(game.flashing, false);
  game.select('whack');
  expectBlack(game);
  game.start(4, 'memory');
  game.current.phase = 'input';
  game.current.score = 19;
  game.input({code:'KeyA'});
  assert.equal(game.status, 'won');
  assert.equal(game.flashing, false);
  assert.equal(game.render().filter(c => c !== '#000000').length, 1);
  game.start(4, 'pong');
  game.current.phase = 'rally';
  game.current.ball = {x: 0.01, y: 0.5, vx: -7, vy: 0};
  game.tick(10);
  assert.equal(game.current.rightScore, 1);
  assert.equal(game.status, 'running');
  assert.equal(game.flashing, false, 'losing a single point must not flash');
});

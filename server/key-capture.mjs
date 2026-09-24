// Short-lived recorder ownership. It never changes the saved Codex mode.
export class KeyCapture {
  constructor(now = Date.now) { this.now = now; this.session = null; this.until = 0; }
  get active() {
    if (this.until <= this.now()) this.session = null;
    return this.session !== null;
  }
  update(session, active) {
    if (typeof session !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(session) || typeof active !== 'boolean')
      throw new Error('按键录入请求无效');
    if (active) { this.session = session; this.until = this.now() + 15000; }
    else if (this.session === session) this.session = null;
    return this.active;
  }
}

import { openRepo } from '../server/src/storage/index.js';
import { createApp } from '../server/src/app.js';

let appPromise;

async function getApp() {
  if (!appPromise) {
    appPromise = openRepo().then((repo) => createApp(repo));
  }

  return appPromise;
}

export default async function handler(req, res) {
  const app = await getApp();
  return app(req, res);
}
// Server-side page loaders: read-only. Writes only ever go through the API.
import { openDb } from '../db/connection.ts';
import { dbPath } from '../paths.ts';
import { listCandidates } from './candidates.ts';
import { positionsView, roleView } from './views.ts';
import { loadPage } from '../obs/route.ts';
import { getAssistModel, getModel, loadEnv } from '../model/index.ts';

loadEnv();
const db = () => openDb(dbPath());
// node:sqlite rows have a null prototype; React Server Components only pass plain objects to client components.
const plain = <T>(x: T): T => JSON.parse(JSON.stringify(x));

export const loadPositions = () => loadPage('/', () => plain({ positions: positionsView(db()), model: getModel().name, assist: getAssistModel().name }));
export const loadRole = (id: string) => loadPage('/role/:id', () => {
  const d = roleView(db(), id);
  return d ? plain({ d, cands: listCandidates(db(), id), model: getModel().name }) : null;
});

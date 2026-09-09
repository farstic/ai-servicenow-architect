// B09 summary — the Mode line and what to do next. Body: ARC-06-S09.
export const id = 'B09';
export const title = 'summary';
export const needsNode = false;
export const runsWhen = () => true;
/** Never cached: it reports on the run that just happened, so a cached summary describes another. */
export const cacheable = false;
export const inputs = () => [];
export const run = async () => ({ status: 'ok', detail: 'placeholder until ARC-06-S09' });

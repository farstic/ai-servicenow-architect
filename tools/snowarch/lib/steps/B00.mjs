// B00 preflight — floors, root check, disk, network, Node detection. Body: ARC-06-S04.
export const id = 'B00';
export const title = 'preflight';
export const needsNode = false;
export const runsWhen = () => true;
/**
 * Never cached, by contract: it is the step that decides whether the machine can run the others,
 * and a cached "yes" from last week is exactly the answer nobody wants when Node has since been
 * uninstalled. The runner enforces this; the flag is here so the reason lives with the step.
 */
export const cacheable = false;
export const inputs = () => [];
export const run = async () => ({ status: 'ok', detail: 'placeholder until ARC-06-S04' });

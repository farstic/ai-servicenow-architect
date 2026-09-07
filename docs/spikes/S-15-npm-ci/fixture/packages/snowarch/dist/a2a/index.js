import { buildAgentCard } from './agent-card.js';
import { taskManager } from './task-manager.js';
export function mountA2ARoutes(httpServer) {
    // Agent card — no auth required for discovery
    httpServer.get('/.well-known/agent.json', async (_req, res) => {
        const card = buildAgentCard();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(card, null, 2));
    }, false);
    // Send task (synchronous)
    httpServer.post('/a2a/tasks/send', async (req, res) => {
        const body = req.body;
        if (!body?.message?.parts?.length) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing message with parts' }));
            return;
        }
        const result = await taskManager.sendTask(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
    });
    // Send task with SSE streaming
    httpServer.post('/a2a/tasks/sendSubscribe', async (req, res) => {
        const body = req.body;
        if (!body?.message?.parts?.length) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing message with parts' }));
            return;
        }
        // Set up SSE
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        });
        // Send working status
        const { randomUUID } = await import('crypto');
        const taskId = body.id || randomUUID();
        res.write(`event: task-status-update\ndata: ${JSON.stringify({ id: taskId, status: { state: 'working', timestamp: new Date().toISOString() } })}\n\n`);
        // Execute
        const result = await taskManager.sendTask({ ...body, id: taskId });
        // Send result
        if (result.artifacts?.length) {
            res.write(`event: task-artifact-update\ndata: ${JSON.stringify({ id: taskId, artifact: result.artifacts[0] })}\n\n`);
        }
        res.write(`event: task-status-update\ndata: ${JSON.stringify({ id: taskId, status: result.status })}\n\n`);
        res.end();
    });
    // Get task status
    httpServer.get('/a2a/tasks/:taskId', async (req, res) => {
        const taskId = req.params.taskId;
        const task = taskManager.getTask(taskId);
        if (!task) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Task not found' }));
            return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(task));
    });
    // Cancel task
    httpServer.post('/a2a/tasks/:taskId/cancel', async (req, res) => {
        const taskId = req.params.taskId;
        const success = taskManager.cancelTask(taskId);
        if (!success) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Task not found or already completed' }));
            return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id: taskId, status: { state: 'canceled' } }));
    });
}
//# sourceMappingURL=index.js.map
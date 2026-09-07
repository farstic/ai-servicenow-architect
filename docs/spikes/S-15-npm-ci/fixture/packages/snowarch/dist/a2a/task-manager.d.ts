import type { Task, SendTaskRequest, SendTaskResponse } from './types.js';
declare class TaskManager {
    private tasks;
    /** Send a task synchronously — execute and return the result. */
    sendTask(request: SendTaskRequest): Promise<SendTaskResponse>;
    /** Get a task by ID. */
    getTask(taskId: string): Task | undefined;
    /** Cancel a task. */
    cancelTask(taskId: string): boolean;
    /**
     * Parse an A2A message to determine which tool to call.
     * Strategy: look for tool name in the text, or match keywords to tools.
     */
    private parseMessage;
    private extractArgsFromText;
    private getHelpText;
}
export declare const taskManager: TaskManager;
export {};
//# sourceMappingURL=task-manager.d.ts.map
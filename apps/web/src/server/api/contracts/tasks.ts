import { z } from "zod";

import { taskCreateSchema, taskUpdateSchema } from "@/server/api/schemas";

import { defineContract } from "./core";
import { errorEnvelopeSchema, successEnvelopeSchema } from "./types";

const taskSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  status: z.enum(["pending", "in_progress", "completed", "canceled"]),
  priority: z.enum(["low", "medium", "high", "urgent"]),
  dueDate: z.string().nullable(),
  completedAt: z.string().nullable(),
  ownerId: z.string().uuid(),
  candidateId: z.string().uuid().nullable(),
  applicationId: z.string().uuid().nullable(),
  jobId: z.string().uuid().nullable(),
  interviewId: z.string().uuid().nullable(),
  createdById: z.string().uuid().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const taskIdPath = z.object({ id: z.string().uuid() });
const taskQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().optional(),
  ownerId: z.string().uuid().optional(),
  status: z
    .enum(["pending", "in_progress", "completed", "canceled"])
    .optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  candidateId: z.string().uuid().optional(),
  applicationId: z.string().uuid().optional(),
  jobId: z.string().uuid().optional(),
  interviewId: z.string().uuid().optional(),
});

export const listTasksContract = defineContract({
  method: "GET",
  path: "/api/v1/tasks",
  operationId: "listTasks",
  summary: "List tasks",
  tags: ["Tasks"],
  auth: { scopes: ["tasks:read"] },
  parameters: { query: taskQuery },
  responses: {
    200: successEnvelopeSchema(z.array(taskSchema)),
    401: errorEnvelopeSchema,
    403: errorEnvelopeSchema,
  },
});

export const createTaskContract = defineContract({
  method: "POST",
  path: "/api/v1/tasks",
  operationId: "createTask",
  summary: "Create task",
  tags: ["Tasks"],
  auth: { scopes: ["tasks:write"] },
  idempotent: true,
  requestBody: taskCreateSchema,
  responses: {
    201: successEnvelopeSchema(taskSchema),
    401: errorEnvelopeSchema,
    403: errorEnvelopeSchema,
    409: errorEnvelopeSchema,
    422: errorEnvelopeSchema,
  },
});

export const getTaskContract = defineContract({
  method: "GET",
  path: "/api/v1/tasks/{id}",
  operationId: "getTask",
  summary: "Get task",
  tags: ["Tasks"],
  auth: { scopes: ["tasks:read"] },
  parameters: { path: taskIdPath },
  responses: {
    200: successEnvelopeSchema(taskSchema),
    401: errorEnvelopeSchema,
    403: errorEnvelopeSchema,
    404: errorEnvelopeSchema,
  },
});

export const updateTaskContract = defineContract({
  method: "PATCH",
  path: "/api/v1/tasks/{id}",
  operationId: "updateTask",
  summary: "Update task",
  tags: ["Tasks"],
  auth: { scopes: ["tasks:write"] },
  parameters: { path: taskIdPath },
  requestBody: taskUpdateSchema,
  responses: {
    200: successEnvelopeSchema(taskSchema),
    401: errorEnvelopeSchema,
    403: errorEnvelopeSchema,
    404: errorEnvelopeSchema,
    422: errorEnvelopeSchema,
  },
});

export const deleteTaskContract = defineContract({
  method: "DELETE",
  path: "/api/v1/tasks/{id}",
  operationId: "deleteTask",
  summary: "Delete task",
  tags: ["Tasks"],
  auth: { scopes: ["tasks:write"] },
  parameters: { path: taskIdPath },
  responses: {
    200: successEnvelopeSchema(z.object({ deleted: z.boolean() })),
    401: errorEnvelopeSchema,
    403: errorEnvelopeSchema,
    404: errorEnvelopeSchema,
  },
});

export const tasksContracts = [
  listTasksContract,
  createTaskContract,
  getTaskContract,
  updateTaskContract,
  deleteTaskContract,
] as const;

import { appConfig } from '../config/env'
import { DemoTodoGateway } from './demo-todo-gateway'
import { HttpTodoGateway } from './http-todo'
import type { TodoGateway } from './todo-gateway'

function createTodoGateway(): TodoGateway {
  return appConfig.demoMode ? new DemoTodoGateway() : new HttpTodoGateway()
}

export let todoGateway = createTodoGateway()

export function refreshTodoGateway(): void {
  todoGateway = createTodoGateway()
}

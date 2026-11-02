import { appConfig } from '../config/env'
import { DemoMealOrderGateway } from './demo-meal-order'
import { HttpMealOrderGateway } from './http-meal-order'
import type { MealOrderGateway } from './meal-order-gateway'

function createMealOrderGateway(): MealOrderGateway {
  return appConfig.demoMode ? new DemoMealOrderGateway() : new HttpMealOrderGateway()
}

export let mealOrderGateway = createMealOrderGateway()

export function refreshMealOrderGateway(): void {
  mealOrderGateway = createMealOrderGateway()
}

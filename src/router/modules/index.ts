import type { RouteRecordRaw } from 'vue-router'

import { adminRoutes } from './admin'
import { authRoutes } from './auth'
import { commonRoutes } from './common'
import { homeRoutes } from './home'
import { matchRoutes } from './match'
import { userRoutes } from './user'

export const routes: RouteRecordRaw[] = [
  ...commonRoutes,
  ...authRoutes,
  ...homeRoutes,
  ...matchRoutes,
  ...userRoutes,
  ...adminRoutes,
]

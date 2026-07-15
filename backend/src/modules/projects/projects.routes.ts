import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requireSuperAdmin } from '../../middleware/permission.middleware';
import { requireProjectParam } from '../../middleware/project.middleware';
import { validate } from '../../middleware/validate.middleware';
import { createProjectSchema, idParamSchema, updateProjectSchema } from './projects.validation';
import * as projectsController from './projects.controller';

const router = Router();

router.use(authenticate);

// Listing is scoped automatically to the caller's assigned projects
// (Super Admin sees all) — safe for any authenticated role to call, since
// it powers project filters/dropdowns across every module.
router.get('/', projectsController.listProjectsHandler);
router.get('/:id', validate(idParamSchema), requireProjectParam(), projectsController.getProjectHandler);

// Create/Edit/Delete Projects is a Super Administrator-only capability.
router.post('/', requireSuperAdmin, validate(createProjectSchema), projectsController.createProjectHandler);
router.put('/:id', requireSuperAdmin, validate(idParamSchema), validate(updateProjectSchema), projectsController.updateProjectHandler);
router.delete('/:id', requireSuperAdmin, validate(idParamSchema), projectsController.deleteProjectHandler);

export default router;

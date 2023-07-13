import type { FastifyInstance } from 'fastify';

import metadataRoute from './metadata.js';
import paymentsRoutes from './payments.js';

export default async function routes(app: FastifyInstance) {
	await app.register(metadataRoute);
	await app.register(paymentsRoutes, { prefix: '/payments' });
}

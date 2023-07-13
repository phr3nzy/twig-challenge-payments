import type { PaymentType } from '@prisma/client';
import type { FastifyInstance } from 'fastify';

interface IInitiatePaymentBody {
	email: string;
	amount: number;
	type: PaymentType;
}

interface IFetchPaymentQuery {
	paymentId: string;
}

export default async function paymentsRoutes(app: FastifyInstance) {
	app.route<{
		Body: IInitiatePaymentBody;
	}>({
		method: 'POST',
		url: '/initiate',
		schema: {
			operationId: 'initiatePayment',
			description: 'This route is used to initiate a new payment.',
			summary: 'Initiate Payment',
			produces: ['application/json'],
			body: app.fluentSchema
				.object()
				.additionalProperties(false)
				.description('The request body of a successful request')
				.prop('email', app.fluentSchema.string().required().format('email'))
				.prop('amount', app.fluentSchema.number().required().minimum(1))
				.prop(
					'type',
					app.fluentSchema
						.string()
						.required()
						.enum(['jewelry', 'shoes', 'grocery']),
				),
			response: {
				201: app.fluentSchema
					.object()
					.additionalProperties(false)
					.description('The response of a successful request')
					.prop('success', app.fluentSchema.boolean())
					.prop('message', app.fluentSchema.string())
					.prop('paymentId', app.fluentSchema.string())
					.prop(
						'status',
						app.fluentSchema.string().enum(['created', 'completed']),
					),
			},
		},
		handler: async (request, reply) => {
			try {
				const { email, amount, type } = request.body;

				const createdPayment = await app.db.payment.create({
					data: {
						email,
						amount,
						type,
						status: 'created',
					},
				});

				app.queue.channel.sendToQueue(
					app.config.EMAILS_QUEUE_NAME,
					Buffer.from(
						JSON.stringify({
							message: 'payment-created',
							data: {
								email,
								amount,
								type,
								paymentId: createdPayment.id,
							},
						}),
					),
				);

				app.queue.channel.sendToQueue(
					app.config.PAYMENTS_QUEUE_NAME,
					Buffer.from(
						JSON.stringify({
							message: 'payment-created',
							data: {
								email,
								amount,
								type,
								paymentId: createdPayment.id,
							},
						}),
					),
				);

				// eslint-disable-next-line @typescript-eslint/no-floating-promises
				reply.status(201);
				return {
					success: true,
					message: 'Payment initiated successfully.',
					paymentId: createdPayment.id,
					status: createdPayment.status,
				};
			} catch (error) {
				app.log.error(error, 'An error occurred while initiating a payment.');
				reply.internalServerError();
				return;
			}
		},
	});

	app.route<{
		Querystring: IFetchPaymentQuery;
	}>({
		method: 'GET',
		url: '/',
		schema: {
			operationId: 'fetchPayment',
			description: 'This route is used to fetch a payment.',
			summary: 'Fetch Payment',
			produces: ['application/json'],
			querystring: app.fluentSchema
				.object()
				.additionalProperties(false)
				.description('The querystring of a successful request')
				.prop('paymentId', app.fluentSchema.string().required()),
			response: {
				200: app.fluentSchema
					.object()
					.additionalProperties(false)
					.description('The response of a successful request')
					.prop('success', app.fluentSchema.boolean())
					.prop('message', app.fluentSchema.string())
					.prop(
						'payment',
						app.fluentSchema
							.object()
							.prop('id', app.fluentSchema.string())
							.prop('email', app.fluentSchema.string())
							.prop('amount', app.fluentSchema.number())
							.prop(
								'type',
								app.fluentSchema.string().enum(['jewelry', 'shoes', 'grocery']),
							)
							.prop(
								'status',
								app.fluentSchema.string().enum(['created', 'completed']),
							),
					),
			},
		},
		handler: async (request, reply) => {
			try {
				const { paymentId } = request.query;

				const payment = await app.db.payment.findUnique({
					where: {
						id: paymentId,
					},
				});

				if (!payment) {
					reply.notFound();
					return;
				}

				// eslint-disable-next-line @typescript-eslint/no-floating-promises
				reply.status(200);
				return {
					success: true,
					message: 'Payment fetched successfully.',
					payment,
				};
			} catch (error) {
				app.log.error(error, 'An error occurred while fetching a payment.');
				reply.internalServerError();
				return;
			}
		},
	});
}

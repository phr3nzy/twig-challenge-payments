import type { FastifyInstance } from 'fastify';

type PaymentsQueuePayload =
	| {
			message: 'payment-created';
			data: {
				email: string;
				amount: number;
				type: string;
				paymentId: string;
			};
	  }
	| {
			message: 'payment-completed';
			data: {
				paymentId: string;
				status: 'created' | 'completed';
			};
	  };

export default async function events(app: FastifyInstance) {
	await app.queue.channel.consume(app.config.PAYMENTS_QUEUE_NAME, async msg => {
		if (msg) {
			const { message, data } = JSON.parse(
				msg.content.toString(),
			) as PaymentsQueuePayload;

			switch (message) {
				case 'payment-created': {
					// We process the payment here
					const { email, amount, type, paymentId } = data;

					const createdPayment = await app.db.payment.findUnique({
						where: { id: paymentId },
					});

					if (createdPayment && createdPayment.status === 'created') {
						await app.db.payment.update({
							where: { id: paymentId },
							data: {
								status: 'completed',
							},
						});

						app.queue.channel.sendToQueue(
							app.config.EMAILS_QUEUE_NAME,
							Buffer.from(
								JSON.stringify({
									message: 'payment-completed',
									data: {
										email,
										amount,
										type,
										paymentId,
									},
								}),
							),
						);

						app.queue.channel.sendToQueue(
							app.config.PAYMENTS_QUEUE_NAME,
							Buffer.from(
								JSON.stringify({
									message: 'payment-completed',
									data: {
										paymentId,
										status: 'completed',
									},
								}),
							),
						);

						app.log.info(`Payment ${paymentId} completed.`);
					}
					break;
				}
				case 'payment-completed': {
					const { paymentId, status } = data;

					const payment = await app.db.payment.findUnique({
						where: { id: paymentId },
					});

					if (payment && status === 'completed') {
						await app.db.payment.update({
							where: { id: paymentId },
							data: {
								status: 'completed',
							},
						});

						app.queue.channel.sendToQueue(
							app.config.ORDERS_QUEUE_NAME,
							Buffer.from(
								JSON.stringify({
									message: 'payment-completed',
									data: {
										paymentId,
										status: 'completed',
									},
								}),
							),
						);

						app.log.info(`Payment ${paymentId} completed.`);
					}
					break;
				}
			}

			app.queue.channel.ack(msg);
		}
	});
}

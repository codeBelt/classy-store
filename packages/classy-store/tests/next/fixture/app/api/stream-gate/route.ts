import {releaseServerGate} from '../../../utils/serverGate/serverGate';

export async function POST(request: Request) {
  const body = (await request.json()) as {ticket?: unknown};
  if (typeof body.ticket !== 'string' || body.ticket.length > 128) {
    return Response.json({error: 'A ticket is required'}, {status: 400});
  }
  releaseServerGate(body.ticket);
  return Response.json({released: true});
}

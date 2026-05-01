import type {
    NextTaskResponse,
    NextLoginRequestResponse,
    TaskResultBody,
    LoginRequestStatusBody,
    SessionUpdateBody,
    HeartbeatBody,
} from '@anjelbuff/shared';

const BASE_URL = process.env.UK_API_URL!;
const WORKER_SECRET = process.env.WORKER_SECRET!;
export const WORKER_ID = process.env.WORKER_ID ?? 'ru-worker-1';

async function request<T>(
    method: string,
    path: string,
    body?: unknown,
): Promise<T | null> {
    const url = `${BASE_URL}/api/v1${path}`;
    const res = await fetch(url, {
        method,
        headers: {
            'Content-Type': 'application/json',
            'X-Worker-Secret': WORKER_SECRET,
        },
        body: body ? JSON.stringify(body) : undefined,
    });

    if (res.status === 204) return null;
    if (!res.ok) throw new Error(`UK API ${method} ${path} → ${res.status}`);
    return res.json() as Promise<T>;
}

export const ukApi = {
    getNextTask: () =>
        request<NextTaskResponse>('GET', `/tasks/next?worker_id=${WORKER_ID}`),

    submitTaskResult: (jobId: string, body: TaskResultBody) =>
        request('POST', `/tasks/${jobId}/result?worker_id=${WORKER_ID}`, body),

    getNextLoginRequest: () =>
        request<NextLoginRequestResponse>('GET', `/login-requests/next?worker_id=${WORKER_ID}`),

    updateLoginRequestStatus: (id: string, body: LoginRequestStatusBody) =>
        request('POST', `/login-requests/${id}/status`, body),

    updateSession: (accountId: string, body: SessionUpdateBody) =>
        request('POST', `/sessions/${accountId}/update?worker_id=${WORKER_ID}`, body),

    heartbeat: () =>
        request('POST', '/workers/heartbeat', {
            worker_id: WORKER_ID,
            active_jobs: [],
        } satisfies HeartbeatBody),
};

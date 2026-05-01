// Job types
export type JobType = 'daily_button' | 'chat_click' | 'relogin' | 'fetch_profile';
export type JobStatus = 'pending' | 'locked' | 'done' | 'failed' | 'skipped';
export type SessionStatus = 'active' | 'expired' | 'relogin_required';
export type AccountStatus = 'pending' | 'active' | 'relogin_required' | 'banned' | 'paused';
export type LoginRequestStatus =
    | 'pending'
    | 'in_progress'
    | 'awaiting_credentials'
    | 'done'
    | 'failed';

export interface Job {
    id: string;
    account_id: string;
    job_type: JobType;
    scheduled_for: string;
    priority: number;
    status: JobStatus;
}

export interface LoginRequest {
    id: string;
    account_id: string;
    status: LoginRequestStatus;
    login_enc: string | null;
    password_enc: string | null;
}

// Worker → UK API
export interface ProfileData {
    user_id: string;
    username: string;
    balance: number;
}

export interface TaskResultBody {
    status: 'success' | 'failed' | 'relogin_required';
    currency_earned?: number;
    profile_data?: ProfileData;
    error_message?: string;
    screenshot_path?: string;
}

export interface LoginRequestStatusBody {
    status: LoginRequestStatus;
    error_message?: string;
}

export interface SessionUpdateBody {
    profile_path: string;
    status: SessionStatus;
    expires_at?: string;
}

export interface HeartbeatBody {
    worker_id: string;
    active_jobs: string[];
}

// UK API → Worker responses
export interface NextTaskResponse {
    job: Job;
}

export interface NextLoginRequestResponse {
    login_request: LoginRequest;
}

export type UserRole = 'admin' | 'trainer' | 'client';

export interface UserProfile {
  id: string;
  email: string;
  role: UserRole;
  fullName: string | null;
  avatarUrl: string | null;
}

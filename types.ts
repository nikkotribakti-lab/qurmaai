
export type Role = 'user' | 'model';

export interface Message {
  id: string;
  role: Role;
  text: string;
  timestamp: string; // Diubah ke string untuk kompatibilitas JSON storage
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  lastUpdated: string;
}

export interface Suggestion {
  title: string;
  prompt: string;
  icon: string;
}

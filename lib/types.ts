// lib/types.ts

export interface TireData {
  images: (File | null)[];
  depths: string[];
  position: string; // New field for tire position
}

export interface TireSubmissionData {
  keys: string[];
  depths: string[];
  position: string;
}

export interface TireDocument {
  plate: string;
  position: string;
  images: string[];
  depths: number[];
  ip: string;
  createdAt: Date;
  tireIndex: number;
}

export interface UploadProgress {
  current: number;
  total: number;
}

export interface ApiResponse {
  success: boolean;
  message?: string;
  error?: string;
  tiresProcessed?: number;
}
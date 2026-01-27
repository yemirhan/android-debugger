import axios from 'axios';
import { AndroidDebugger } from '@android-debugger/sdk';

// Create axios instance for JSONPlaceholder API
export const api = axios.create({
  baseURL: 'https://jsonplaceholder.typicode.com',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Setup axios interceptor for debugger
export function setupAxiosInterceptor() {
  return AndroidDebugger.interceptAxios(api);
}

// API helper functions
export const apiHelpers = {
  // Get all posts
  getPosts: () => api.get('/posts'),

  // Get single post
  getPost: (id: number) => api.get(`/posts/${id}`),

  // Create post
  createPost: (data: { title: string; body: string; userId: number }) =>
    api.post('/posts', data),

  // Update post
  updatePost: (id: number, data: { title?: string; body?: string }) =>
    api.patch(`/posts/${id}`, data),

  // Delete post
  deletePost: (id: number) => api.delete(`/posts/${id}`),

  // Get users
  getUsers: () => api.get('/users'),

  // Get comments for a post
  getComments: (postId: number) => api.get(`/posts/${postId}/comments`),

  // Simulate slow request
  getSlowData: () =>
    new Promise((resolve) => {
      setTimeout(() => {
        api.get('/posts/1').then(resolve);
      }, 2000);
    }),

  // Simulate error
  triggerError: () => api.get('/nonexistent-endpoint'),
};

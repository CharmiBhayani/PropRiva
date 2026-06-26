import axios from "axios";

const API = axios.create({
  baseURL: "http://localhost:5000/api",
  withCredentials: true, // Crucial for sending/receiving HttpOnly cookies
});

// Response interceptor to format errors nicely
API.interceptors.response.use(
  (response) => response,
  (error) => {
    // extract message from response if it exists
    const message = error.response?.data?.message || "Something went wrong. Please try again.";
    return Promise.reject(new Error(message));
  }
);

export default API;

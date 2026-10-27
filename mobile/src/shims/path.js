export const join = (...parts) => parts.join('/').replace(/\/+/g, '/');
export default {join};

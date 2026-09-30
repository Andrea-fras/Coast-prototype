import { API_URL } from '../config';
import { createSourceUploadQueue } from './sourceUploadQueue';

export const uploads = createSourceUploadQueue({ baseUrl: API_URL, storage: sessionStorage });

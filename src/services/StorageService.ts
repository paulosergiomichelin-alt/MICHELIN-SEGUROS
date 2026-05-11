import { storage, auth } from '../lib/firebase';
import { 
  ref, 
  uploadBytesResumable, 
  uploadBytes,
  getDownloadURL, 
  deleteObject, 
  UploadTaskSnapshot,
  StorageError
} from 'firebase/storage';
import { logger } from './LoggerService';

export interface UploadProgress {
  bytesTransferred: number;
  totalBytes: number;
  percentage: number;
  status: 'running' | 'paused' | 'success' | 'error';
}

export class StorageService {
  private static ALLOWED_EXTENSIONS = {
    branding: ['png', 'jpg', 'jpeg', 'webp', 'ico'],
    documents: ['pdf', 'png', 'jpg', 'jpeg', 'webp'],
    avatars: ['png', 'jpg', 'jpeg', 'webp']
  };

  private static MAX_SIZES = {
    branding: 1024 * 512, // 512KB
    documents: 1024 * 1024 * 10, // 10MB
    avatars: 1024 * 1024 * 2, // 2MB
  };

  /**
   * Validates file before upload
   */
  private static validateFile(file: File | Blob, type: 'branding' | 'documents' | 'avatars', fileName: string): void {
    const extension = fileName.split('.').pop()?.toLowerCase() || '';
    const size = file.size;

    // Check extension
    if (!this.ALLOWED_EXTENSIONS[type].includes(extension)) {
      throw new Error(`Tipo de arquivo não permitido: .${extension}. Permitidos: ${this.ALLOWED_EXTENSIONS[type].join(', ')}`);
    }

    // Check size
    if (size > this.MAX_SIZES[type]) {
      const maxSizeMB = (this.MAX_SIZES[type] / (1024 * 1024)).toFixed(1);
      throw new Error(`Arquivo muito grande (${(size / (1024 * 1024)).toFixed(1)}MB). Máximo permitido: ${maxSizeMB}MB`);
    }
  }

  /**
   * Uploads a file with progress tracking
   */
  public static async uploadFile(
    file: File | Blob, 
    type: 'branding' | 'documents' | 'avatars' | string, 
    fileName: string,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<{ url: string; path: string }> {
    const userId = auth.currentUser?.uid;
    if (!userId) {
      throw new Error('Usuário não autenticado no storage');
    }

    // Force token refresh to ensure auth state is synced for Storage
    try {
      await auth.currentUser?.getIdToken(true);
    } catch (e) {
      console.warn('[STORAGE] Failed to refresh token, continuing anyway...', e);
    }

    console.log(`[STORAGE_DEBUG] User UID: ${userId} | Type: ${type} | FileName: ${fileName}`);

    // Validation
    if (['branding', 'documents', 'avatars'].includes(type)) {
      this.validateFile(file, type as any, fileName);
    }

    const timestamp = Date.now();
    const folder = type === 'system' ? 'branding' : type;
    const sanitizedFileName = fileName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '');
    const storagePath = `users/${userId}/${folder}/${timestamp}_${sanitizedFileName}`;
    const storageRef = ref(storage, storagePath);
    const metadata = {
      contentType: file.type || (fileName.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream')
    };

    // Use uploadBytes for small files (< 1MB) as it's more reliable in some proxy environments
    if (file.size < 1024 * 1024 && !onProgress) {
      try {
        console.log(`[STORAGE] Using uploadBytes for small file: ${storagePath} | Type: ${metadata.contentType}`);
        const snapshot = await uploadBytes(storageRef, file, metadata);
        const url = await getDownloadURL(snapshot.ref);
        console.log('[UPLOAD_COMPLETED_SIMPLE]', storagePath);
        return { url, path: storagePath };
      } catch (error) {
         console.error('[UPLOAD_FAILED_SIMPLE]', error);
         const msg = this.getErrorMessage(error as StorageError);
        throw new Error(msg, { cause: error });
      }
    }

    return new Promise((resolve, reject) => {
      console.log(`[STORAGE] Starting upload resumable: ${storagePath} (${file.size} bytes) | Type: ${metadata.contentType}`);
      const uploadTask = uploadBytesResumable(storageRef, file, metadata);

      uploadTask.on(
        'state_changed',
        (snapshot: UploadTaskSnapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          console.log(`[UPLOAD_PROGRESS] ${storagePath}: ${progress.toFixed(2)}%`);
          
          if (onProgress) {
            onProgress({
              bytesTransferred: snapshot.bytesTransferred,
              totalBytes: snapshot.totalBytes,
              percentage: progress,
              status: snapshot.state as 'running' | 'paused' | 'success' | 'error'
            });
          }
        },
        (error: StorageError) => {
          console.error('[UPLOAD_FAILED]', error);
          logger.error('STORAGE', `Upload failed for ${storagePath}`, error);
          reject(new Error(this.getErrorMessage(error)));
        },
        async () => {
          try {
            console.log('[UPLOAD_COMPLETED]', storagePath);
            const url = await getDownloadURL(uploadTask.snapshot.ref);
            console.log('[DOWNLOAD_URL_RECEIVED]', url);
            
            logger.info('STORAGE', 'FILE_UPLOADED', { path: storagePath, url });
            resolve({ url, path: storagePath });
          } catch (err) {
            console.error('[DOWNLOAD_URL_FAILED]', err);
            reject(err);
          }
        }
      );
    });
  }

  /**
   * Specialized upload for branding assets (logos)
   */
  public static async uploadBranding(
    file: File | Blob, 
    logoType: 'logoDark' | 'logoLight' | 'favicon',
    onProgress?: (progress: UploadProgress) => void
  ): Promise<{ url: string; path: string }> {
    const ext = logoType === 'favicon' ? 'ico' : 'webp';
    const fileName = `brand_${logoType}.${ext}`;
    return this.uploadFile(file, 'branding', fileName, onProgress);
  }

  /**
   * Deletes a file from storage
   */
  public static async deleteFile(path: string): Promise<void> {
    try {
      const storageRef = ref(storage, path);
      await deleteObject(storageRef);
      console.log(`[STORAGE_DELETE_SUCCESS] ${path}`);
    } catch (error) {
      console.error(`[STORAGE_DELETE_FAILED] ${path}`, error);
    }
  }

  /**
   * Retrieves a download URL for a given path
   */
  public static async getFileUrl(path: string): Promise<string> {
    try {
      const storageRef = ref(storage, path);
      return await getDownloadURL(storageRef);
    } catch (error) {
      console.error(`[STORAGE_URL_FAILED] ${path}`, error);
      throw error;
    }
  }

  private static getErrorMessage(error: StorageError): string {
    switch (error.code) {
      case 'storage/unauthorized':
        return 'Permissão negada para acessar o storage.';
      case 'storage/canceled':
        return 'Upload cancelado pelo usuário.';
      case 'storage/retry-limit-exceeded':
        return 'Limite de tentativas excedido. Verifique sua conexão.';
      case 'storage/quota-exceeded':
        return 'Quota de armazenamento excedida.';
      default:
        return `Erro no storage: ${error.message}`;
    }
  }
}

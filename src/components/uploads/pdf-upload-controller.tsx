'use client';

import React, {
  useState,
  useRef,
  useCallback,
  useImperativeHandle,
  forwardRef,
  useEffect,
} from 'react';
import { toast } from 'sonner';
import { UploadProgressModal, UploadProgressStep } from '@/components/uploads/upload-progress-modal';
import { UploadResultModal } from '@/components/uploads/upload-result-modal';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { apiClient, ApiClientError } from '@/lib/api/client';
import { formatCaracasDate } from '@/lib/domain/format';
import { MESSAGES } from '@/lib/i18n/messages';

export interface PdfUploadControllerRef {
  openFilePicker: () => void;
}

export interface PdfUploadControllerProps {
  onUploadSuccess: () => void | Promise<void>;
  onBusyChange?: (isBusy: boolean) => void;
}

const MAX_PDF_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export const PdfUploadController = forwardRef<
  PdfUploadControllerRef,
  PdfUploadControllerProps
>(function PdfUploadController({ onUploadSuccess, onBusyChange }, ref) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Estados del flujo
  const [isUploading, setIsUploading] = useState(false);
  const [progressStep, setProgressStep] = useState<UploadProgressStep>('uploading');

  // Estado de confirmación de lista antigua
  const [confirmData, setConfirmData] = useState<{
    uploadId: string;
    pdfDate: string;
    activeDate: string;
  } | null>(null);
  const [isConfirmingAction, setIsConfirmingAction] = useState(false);

  // Estado de ventana de resultado
  const [resultData, setResultData] = useState<{
    readCount: number;
    newCount: number;
    pricelessStoreCount: number;
  } | null>(null);

  // Notificar al padre cuando hay interacción en curso para pausar el polling silencioso
  const isBusy = isUploading || confirmData !== null || resultData !== null;
  useEffect(() => {
    onBusyChange?.(isBusy);
  }, [isBusy, onBusyChange]);

  const openFilePicker = useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  }, []);

  useImperativeHandle(ref, () => ({
    openFilePicker,
  }));

  const resetState = () => {
    setIsUploading(false);
    setProgressStep('uploading');
    setConfirmData(null);
    setIsConfirmingAction(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    // Si el dueño cierra el selector sin elegir archivo, no ocurre nada (Sección 8: L297)
    if (!files || files.length === 0) {
      return;
    }

    const file = files[0];

    // 1. Validación en cliente de tipo PDF
    const isPdf =
      file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

    if (!isPdf) {
      toast.error(MESSAGES.ERROR_ONLY_PDF);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // 2. Validación en cliente de tamaño (<= 10MB)
    if (file.size > MAX_PDF_SIZE_BYTES) {
      toast.error(MESSAGES.ERROR_FILE_TOO_LARGE);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    try {
      setIsUploading(true);
      setProgressStep('uploading');

      // 3. Solicitar permiso temporal de subida
      const req = await apiClient.requestUpload({
        filename: file.name,
        mimeType: 'application/pdf',
        sizeBytes: file.size,
      });

      // 4. Subir el archivo directamente al signedUrl mediante PUT con FormData
      const formData = new FormData();
      formData.append('cacheControl', '3600');
      formData.append('', file);

      const uploadRes = await fetch(req.signedUrl, {
        method: 'PUT',
        headers: {
          'x-upsert': 'false',
        },
        body: formData,
      });

      if (!uploadRes.ok) {
        throw new Error('No se pudo subir el archivo al depósito.');
      }

      // 5. Avisar al servidor para procesar y leer productos
      setProgressStep('reading');
      const processRes = await apiClient.processUpload(req.uploadId);

      // 6. Verificar si requiere confirmación de fecha antigua
      if (processRes.status === 'requires_confirmation') {
        setIsUploading(false);
        setConfirmData({
          uploadId: processRes.uploadId,
          pdfDate: processRes.pdfDate,
          activeDate: processRes.activeDate,
        });
        return;
      }

      // 7. Aplicado directamente con éxito
      setIsUploading(false);
      toast.success(MESSAGES.PDF_PROCESSED_SUCCESS);

      setResultData({
        readCount: processRes.readCount,
        newCount: processRes.newCount,
        pricelessStoreCount: processRes.pricelessStoreCount,
      });

      await onUploadSuccess();
    } catch (err) {
      console.error('[Upload Error]', err);
      setIsUploading(false);

      if (err instanceof ApiClientError) {
        toast.error(err.message);
      } else {
        toast.error(MESSAGES.GENERIC_ERROR);
      }
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Manejo de la decisión del diálogo de confirmación de lista antigua
  const handleConfirmOlderPdf = async () => {
    if (!confirmData) return;
    try {
      setIsConfirmingAction(true);
      const uploadId = confirmData.uploadId;
      setConfirmData(null);

      setIsUploading(true);
      setProgressStep('updating');

      const confirmRes = await apiClient.confirmUpload(uploadId, 'confirm');

      setIsUploading(false);
      toast.success(MESSAGES.PDF_PROCESSED_SUCCESS);

      setResultData({
        readCount: confirmRes.readCount ?? 0,
        newCount: confirmRes.newCount ?? 0,
        pricelessStoreCount: confirmRes.pricelessStoreCount ?? 0,
      });

      await onUploadSuccess();
    } catch (err) {
      console.error('[Confirm Upload Error]', err);
      setIsUploading(false);
      toast.error(err instanceof ApiClientError ? err.message : MESSAGES.GENERIC_ERROR);
    } finally {
      setIsConfirmingAction(false);
      resetState();
    }
  };

  const handleCancelOlderPdf = async () => {
    if (!confirmData) return;
    const uploadId = confirmData.uploadId;
    setConfirmData(null);

    try {
      // Cancelación silenciosa en el servidor: la carga queda 'failed' sin mostrar error (Sección 8: L304)
      await apiClient.confirmUpload(uploadId, 'cancel');
    } catch {
      // Ignorar fallo de cancelación
    } finally {
      resetState();
    }
  };

  return (
    <>
      {/* Input oculto para abrir el selector de archivos nativo */}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Ventana inamovible de progreso */}
      <UploadProgressModal isOpen={isUploading} step={progressStep} />

      {/* Ventana de confirmación cuando el PDF tiene fecha anterior a la activa */}
      {confirmData && (
        <ConfirmDialog
          isOpen={true}
          title={MESSAGES.CONFIRM_OLDER_PDF_TITLE}
          description={MESSAGES.confirmOlderPdfText(
            formatCaracasDate(confirmData.pdfDate),
            formatCaracasDate(confirmData.activeDate)
          )}
          confirmText={MESSAGES.CONFIRM_BUTTON_CONTINUE}
          cancelText={MESSAGES.CANCEL_BUTTON}
          isLoading={isConfirmingAction}
          onConfirm={handleConfirmOlderPdf}
          onCancel={handleCancelOlderPdf}
        />
      )}

      {/* Ventana modal de resultado con cantidades */}
      {resultData && (
        <UploadResultModal
          isOpen={true}
          readCount={resultData.readCount}
          newCount={resultData.newCount}
          pricelessStoreCount={resultData.pricelessStoreCount}
          onClose={() => setResultData(null)}
        />
      )}
    </>
  );
});

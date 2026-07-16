import { notFound } from 'next/navigation';
import { LoadingPreviewClient } from './preview-client';

export default function LoadingPreviewPage() {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }

  return <LoadingPreviewClient />;
}

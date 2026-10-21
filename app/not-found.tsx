'use client';

import Link from 'next/link';
import { motion } from 'motion/react';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Compass } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background text-foreground p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center max-w-md"
      >
        <div className="w-12 h-12 rounded-full bg-muted/40 flex items-center justify-center mx-auto mb-6">
          <Compass className="w-5 h-5 text-foreground/80" />
        </div>

        <h1 className="text-4xl mb-4 text-neutral-800 dark:text-neutral-100 font-be-vietnam-pro">Page not found</h1>
        <p className="text-lg mb-8 text-neutral-600 dark:text-neutral-300">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>

        <div className="flex justify-center">
          <Link href="/new">
            <Button variant="default" className="flex items-center gap-2 px-4 py-2 rounded-full">
              <ArrowLeft size={18} />
              <span>Return to home</span>
            </Button>
          </Link>
        </div>
      </motion.div>
    </div>
  );
}

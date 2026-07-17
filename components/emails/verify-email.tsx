import * as React from 'react';
import {
  Html,
  Head,
  Preview,
  Body,
  Container,
  Section,
  Img,
  Text,
  Button,
  Link,
  Hr,
  Tailwind,
  pixelBasedPreset,
  type TailwindConfig,
} from '@react-email/components';

interface VerifyEmailProps {
  url: string;
}

// Brand colors derived from globals.css (OKLCH converted to hex)
const colors = {
  primary: '#654a3a', // warm brown - oklch(0.4341 0.0392 41.9938)
  primaryForeground: '#ffffff',
  secondary: '#ede4d3', // cream/beige - oklch(0.92 0.0651 74.3695)
  secondaryForeground: '#5c4533', // oklch(0.3499 0.0685 40.8288)
  foreground: '#1f1f1f', // near black - oklch(0.2435 0 0)
  background: '#fafafa', // off-white - oklch(0.9821 0 0)
  card: '#fdfdfd', // almost white - oklch(0.9911 0 0)
  muted: '#f3f3f3', // light gray - oklch(0.9521 0 0)
  mutedForeground: '#787878', // medium gray - oklch(0.5032 0 0)
  border: '#dedede', // light gray - oklch(0.8822 0 0)
};

const tailwindConfig = {
  presets: [pixelBasedPreset],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: colors.primary,
          'primary-foreground': colors.primaryForeground,
          secondary: colors.secondary,
          'secondary-foreground': colors.secondaryForeground,
          foreground: colors.foreground,
          background: colors.background,
          card: colors.card,
          muted: colors.muted,
          'muted-foreground': colors.mutedForeground,
          border: colors.border,
        },
      },
    },
  },
} satisfies TailwindConfig;

function VerifyEmail({ url }: VerifyEmailProps) {
  const previewText = 'Confirm your email to activate your Zetora account';

  return (
    <Html lang="en" dir="ltr">
      <Tailwind config={tailwindConfig}>
        <Head />
        <Preview>{previewText}</Preview>
        <Body className="bg-brand-background font-sans m-0 p-0">
          <Container className="mx-auto" style={{ maxWidth: '100%', width: '100%', padding: '16px' }}>
            <Container
              className="mx-auto bg-brand-card overflow-hidden"
              style={{ maxWidth: '480px', width: '100%', borderRadius: '12px' }}
            >
              <Section className="h-1.5" style={{ backgroundColor: colors.primary }} />

              <Section className="text-center" style={{ padding: '32px 24px 20px' }}>
                <Img
                  src="https://zetora.ai/icon.png"
                  alt="Zetora AI"
                  width={44}
                  height={44}
                  className="mx-auto"
                  style={{ marginBottom: '20px' }}
                />
                <Text
                  className="font-semibold text-brand-foreground m-0"
                  style={{ fontSize: '22px', marginBottom: '12px' }}
                >
                  Confirm your email
                </Text>
                <Text className="text-brand-muted-foreground m-0" style={{ fontSize: '14px', lineHeight: '1.6' }}>
                  Click the button below to activate your account and start using Zetora.
                </Text>
              </Section>

              <Hr className="border-brand-border my-0" style={{ marginLeft: '24px', marginRight: '24px' }} />

              <Section className="text-center" style={{ padding: '32px 24px' }}>
                <Button
                  href={url}
                  className="bg-brand-primary text-brand-primary-foreground font-medium no-underline"
                  style={{
                    display: 'inline-block',
                    padding: '12px 28px',
                    borderRadius: '8px',
                    fontSize: '14px',
                  }}
                >
                  Verify email address
                </Button>
                <Text
                  className="text-brand-muted-foreground m-0"
                  style={{ fontSize: '12px', marginTop: '20px', wordBreak: 'break-all' }}
                >
                  Or copy and paste this link: {url}
                </Text>
              </Section>

              <Section className="bg-brand-muted text-center" style={{ padding: '24px' }}>
                <Text className="text-brand-muted-foreground m-0" style={{ fontSize: '12px', marginBottom: '4px' }}>
                  If you didn&apos;t create an account with Zetora, you can safely ignore this email.
                </Text>
                <Text className="text-brand-muted-foreground m-0" style={{ fontSize: '12px', marginTop: '8px' }}>
                  <Link href="https://zetora.ai" className="text-brand-primary no-underline">
                    zetora.ai
                  </Link>
                </Text>
              </Section>
            </Container>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

VerifyEmail.PreviewProps = {
  url: 'https://zetora.ai/api/auth/verify-email?token=example-token&callbackURL=%2F',
} satisfies VerifyEmailProps;

export default VerifyEmail;

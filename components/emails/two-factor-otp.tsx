import {
  Html,
  Head,
  Preview,
  Body,
  Container,
  Section,
  Img,
  Text,
  Hr,
  Tailwind,
  pixelBasedPreset,
  type TailwindConfig,
} from '@react-email/components';
import { getAppUrl } from './app-url';

interface TwoFactorOtpEmailProps {
  otp: string;
}

// Brand colors derived from globals.css (OKLCH converted to hex)
const colors = {
  primary: '#654a3a', // warm brown - oklch(0.4341 0.0392 41.9938)
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

function TwoFactorOtpEmail({ otp }: TwoFactorOtpEmailProps) {
  const previewText = `Your Zetora sign-in code: ${otp}`;
  const appUrl = getAppUrl();

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
                  src={`${appUrl}/icon.png`}
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
                  Your sign-in code
                </Text>
                <Text className="text-brand-muted-foreground m-0" style={{ fontSize: '14px', lineHeight: '1.6' }}>
                  Enter this code to finish signing in to Zetora.
                </Text>
              </Section>

              <Hr className="border-brand-border my-0" style={{ marginLeft: '24px', marginRight: '24px' }} />

              <Section className="text-center" style={{ padding: '32px 24px' }}>
                <Text
                  className="font-semibold text-brand-foreground m-0"
                  style={{ fontSize: '36px', letterSpacing: '8px' }}
                >
                  {otp}
                </Text>
                <Text className="text-brand-muted-foreground m-0" style={{ fontSize: '12px', marginTop: '20px' }}>
                  This code expires in a few minutes.
                </Text>
              </Section>

              <Section className="bg-brand-muted text-center" style={{ padding: '24px' }}>
                <Text className="text-brand-muted-foreground m-0" style={{ fontSize: '12px' }}>
                  If you didn&apos;t try to sign in, you can safely ignore this email.
                </Text>
              </Section>
            </Container>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

TwoFactorOtpEmail.PreviewProps = {
  otp: '482913',
} satisfies TwoFactorOtpEmailProps;

export default TwoFactorOtpEmail;

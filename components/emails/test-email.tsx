import { Body, Container, Head, Heading, Html, Preview, Text } from '@react-email/components';

export default function TestEmailTemplate() {
  return (
    <Html>
      <Head />
      <Preview>Zetora email configuration test</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>✅ Email Configured</Heading>
          <Text style={text}>
            Your email provider is correctly configured. You will now receive lookout completion emails at this address.
          </Text>
          <Text style={footer}>Sent by Zetora</Text>
        </Container>
      </Body>
    </Html>
  );
}

const main = {
  backgroundColor: '#0a0a0a',
  fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
};

const container = {
  margin: '0 auto',
  padding: '32px 24px',
  maxWidth: '480px',
};

const h1 = {
  color: '#fafafa',
  fontSize: '24px',
  fontWeight: '700',
  margin: '0 0 16px',
};

const text = {
  color: '#a3a3a3',
  fontSize: '16px',
  lineHeight: '1.6',
  margin: '0 0 24px',
};

const footer = {
  color: '#525252',
  fontSize: '12px',
  margin: '0',
};

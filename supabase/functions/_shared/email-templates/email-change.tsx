/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface EmailChangeEmailProps {
  siteName: string
  email: string
  newEmail: string
  confirmationUrl: string
}

export const EmailChangeEmail = ({
  email,
  newEmail,
  confirmationUrl,
}: EmailChangeEmailProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Confirmação de alteração de e-mail — SmartBus BR</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={brand}>SmartBus BR</Text>
        <Container style={card}>
          <Heading style={h1}>Confirme a alteração de e-mail</Heading>
          <Text style={text}>
            Você solicitou a alteração do seu e-mail no SmartBus BR de{' '}
            <Link href={`mailto:${email}`} style={emailLink}>{email}</Link>{' '}
            para{' '}
            <Link href={`mailto:${newEmail}`} style={emailLink}>{newEmail}</Link>.
          </Text>
          <Container style={ctaWrapper}>
            <Button style={button} href={confirmationUrl}>
              Confirmar alteração
            </Button>
          </Container>
          <Text style={helperText}>
            Se o botão não funcionar, copie e cole este link no navegador:
          </Text>
          <Link style={fallbackLink} href={confirmationUrl}>{confirmationUrl}</Link>
          <Container style={securityBox}>
            <Text style={securityText}>Se você não solicitou esta ação, ignore este e-mail.</Text>
          </Container>
        </Container>
        <Text style={footerText}>SmartBus BR • Plataforma de venda de passagens e gestão de viagens.</Text>
        <Text style={footerText}>Site oficial SmartBus BR.</Text>
        <Text style={footerText}>E-mail automático. Não responda esta mensagem.</Text>
      </Container>
    </Body>
  </Html>
)

export default EmailChangeEmail

const main = {
  backgroundColor: '#f3f5f8',
  fontFamily: 'Arial, sans-serif',
  margin: '0',
  padding: '24px 12px',
}

const container = {
  margin: '0 auto',
  maxWidth: '560px',
}

const brand = {
  color: '#111827',
  fontSize: '18px',
  fontWeight: '700' as const,
  margin: '0 0 14px',
  textAlign: 'center' as const,
}

const card = {
  backgroundColor: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: '12px',
  padding: '28px 24px',
}

const h1 = {
  color: '#111827',
  fontSize: '24px',
  fontWeight: '700' as const,
  lineHeight: '1.3',
  margin: '0 0 14px',
}

const text = {
  color: '#374151',
  fontSize: '15px',
  lineHeight: '1.6',
  margin: '0 0 20px',
}

const emailLink = {
  color: '#374151',
  textDecoration: 'underline',
}

const ctaWrapper = {
  margin: '0 0 18px',
  textAlign: 'center' as const,
}

const button = {
  backgroundColor: '#f07d00',
  borderRadius: '10px',
  color: '#ffffff',
  display: 'inline-block',
  fontSize: '15px',
  fontWeight: '700' as const,
  padding: '12px 20px',
  textDecoration: 'none',
}

const helperText = {
  color: '#4b5563',
  fontSize: '13px',
  lineHeight: '1.5',
  margin: '0 0 6px',
}

const fallbackLink = {
  color: '#1d4ed8',
  fontSize: '13px',
  lineHeight: '1.5',
  wordBreak: 'break-all' as const,
}

const securityBox = {
  backgroundColor: '#f9fafb',
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  marginTop: '20px',
  padding: '12px',
}

const securityText = {
  color: '#4b5563',
  fontSize: '13px',
  lineHeight: '1.5',
  margin: '0',
}

const footerText = {
  color: '#6b7280',
  fontSize: '12px',
  lineHeight: '1.5',
  margin: '12px 0 0',
  textAlign: 'center' as const,
}

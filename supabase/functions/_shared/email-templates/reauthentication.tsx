/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface ReauthenticationEmailProps {
  token: string
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Seu código de verificação — SmartBus BR</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={brand}>SmartBus BR</Text>
        <Container style={card}>
          <Heading style={h1}>Confirme sua identidade</Heading>
          <Text style={text}>Use o código abaixo para confirmar sua identidade no SmartBus BR.</Text>
          <Container style={codeBox}>
            <Text style={codeStyle}>{token}</Text>
          </Container>
          <Text style={helperText}>Este código expira em poucos minutos.</Text>
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

export default ReauthenticationEmail

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

const codeBox = {
  backgroundColor: '#fff7ed',
  border: '1px solid #fed7aa',
  borderRadius: '10px',
  marginBottom: '16px',
  padding: '12px',
}

const codeStyle = {
  color: '#c2410c',
  fontFamily: 'Courier, monospace',
  fontSize: '28px',
  fontWeight: '700' as const,
  letterSpacing: '4px',
  lineHeight: '1.2',
  margin: '0',
  textAlign: 'center' as const,
}

const helperText = {
  color: '#4b5563',
  fontSize: '13px',
  lineHeight: '1.5',
  margin: '0',
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

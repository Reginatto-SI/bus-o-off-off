/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface RecoveryEmailProps {
  siteName: string
  confirmationUrl: string
}

export const RecoveryEmail = ({
  confirmationUrl,
}: RecoveryEmailProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Criar nova senha — SmartBus BR</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Criar nova senha</Heading>
        <Text style={text}>
          Recebemos uma solicitação para redefinir a senha da sua conta no SmartBus BR. Clique no botão abaixo para criar uma nova senha:
        </Text>
        <Button style={button} href={confirmationUrl}>
          Criar nova senha
        </Button>
        <Text style={footerText}>
          SmartBus BR — Plataforma de venda de passagens e gestão de viagens.
        </Text>
        <Text style={footerText}>
          Este é um e-mail automático do SmartBus BR. Se você não reconhece esta ação, ignore esta mensagem com segurança.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default RecoveryEmail

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '20px 25px' }
const h1 = {
  fontSize: '22px',
  fontWeight: 'bold' as const,
  color: '#1a2332',
  margin: '0 0 20px',
}
const text = {
  fontSize: '14px',
  color: '#6b7280',
  lineHeight: '1.5',
  margin: '0 0 25px',
}
const button = {
  backgroundColor: '#f07d00',
  color: '#ffffff',
  fontSize: '14px',
  borderRadius: '8px',
  padding: '12px 20px',
  textDecoration: 'none',
}
const footerText = { fontSize: '12px', color: '#999999', margin: '20px 0 0', lineHeight: '1.5' }

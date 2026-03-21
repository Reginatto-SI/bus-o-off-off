import { WhatsAppIcon } from '@/components/ui/WhatsAppIcon';
import { buildWhatsappWaMeLink } from '@/lib/whatsapp';

const WHATSAPP_PHONE = '(31) 99207-4309';
const WHATSAPP_MESSAGE = 'Quero começar a vender passagens com o Smartbus BR';
// Atualização obrigatória do contato comercial: centralizamos telefone e mensagem para evitar resquícios do número antigo.
const WHATSAPP_URL =
  buildWhatsappWaMeLink({
    phone: WHATSAPP_PHONE,
    message: WHATSAPP_MESSAGE,
  }) ?? 'https://wa.me/5531992074309?text=Quero%20come%C3%A7ar%20a%20vender%20passagens%20com%20o%20Smartbus%20BR';

export function FloatingWhatsApp() {
  return (
    <a
      href={WHATSAPP_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Falar pelo WhatsApp"
      className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg transition-transform hover:scale-110 animate-subtle-pulse"
    >
      <WhatsAppIcon size={28} />
    </a>
  );
}

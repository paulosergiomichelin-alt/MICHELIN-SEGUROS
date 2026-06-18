import React from 'react';
import { Link } from 'react-router-dom';

export default function PoliticaPrivacidade() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans antialiased">
      <header className="bg-[#111] border-b border-white/[0.08] px-6 sticky top-0 z-50">
        <div className="max-w-3xl mx-auto h-[60px] flex items-center justify-between">
          <span className="text-[#CFA764] font-black text-[13px] tracking-[0.15em] uppercase">Michelin Seguros</span>
          <span className="text-[9px] font-bold tracking-[0.15em] uppercase text-white/30 bg-white/5 border border-white/[0.08] px-3 py-1 rounded-full">LGPD</span>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 pt-4 flex items-center gap-2 text-[11px] text-white/35 font-semibold tracking-wide">
        <Link to="/" className="hover:text-[#CFA764] transition-colors">Início</Link>
        <span>›</span>
        <span className="text-[#CFA764]">Política de Privacidade</span>
      </div>

      <main className="max-w-3xl mx-auto px-6 py-8 pb-20">
        <div className="border-l-[3px] border-[#CFA764] pl-5 mb-10">
          <span className="inline-block text-[9px] font-black tracking-[0.2em] uppercase text-[#CFA764] bg-[#CFA764]/10 border border-[#CFA764]/25 px-2.5 py-1 rounded mb-3">LGPD · Lei 13.709/2018</span>
          <h1 className="text-3xl font-black text-white leading-tight tracking-tight mb-2">Política de Privacidade</h1>
          <p className="text-[11px] text-white/30 font-semibold tracking-wide uppercase">Atualizado em 17 de junho de 2026</p>
        </div>

        {[
          {
            title: '1. Quem Somos',
            content: (
              <p className="text-white/55 text-sm leading-relaxed">
                A <strong className="text-white">Michelin Seguros Administradora e Corretora de Seguros Ltda</strong>, com sede em Dourados-MS, é a controladora dos dados pessoais tratados nesta Política. Você pode entrar em contato conosco pelo e-mail{' '}
                <a href="mailto:contato@michelinseguros.com.br" className="text-[#CFA764] hover:text-[#E8C97A]">contato@michelinseguros.com.br</a>{' '}
                ou pelo WhatsApp{' '}
                <a href="https://wa.me/5567996748603" className="text-[#CFA764] hover:text-[#E8C97A]">(67) 99674-8603</a>.
              </p>
            ),
          },
          {
            title: '2. Dados Coletados',
            content: (
              <>
                <p className="text-white/55 text-sm leading-relaxed mb-3">Coletamos dados pessoais necessários para a prestação de serviços de corretagem e administração de seguros:</p>
                <ul className="space-y-1">
                  {['Nome completo, CPF, RG, data de nascimento', 'Endereço residencial e comercial', 'Telefone, WhatsApp e e-mail', 'Dados de veículos, imóveis e demais bens segurados', 'Informações de apólices e histórico de sinistros', 'Dados de comunicação via WhatsApp Business'].map(item => (
                    <li key={item} className="text-white/55 text-sm pl-4 relative before:absolute before:left-0 before:content-['–'] before:text-[#CFA764] before:font-bold">{item}</li>
                  ))}
                </ul>
              </>
            ),
          },
          {
            title: '3. Finalidade do Tratamento',
            content: (
              <ul className="space-y-1">
                {['Cotação, contratação e renovação de seguros', 'Atendimento ao cliente e suporte pós-venda', 'Cumprimento de obrigações legais e regulatórias (SUSEP)', 'Envio de comunicações sobre apólices e renovações', 'Melhoria contínua dos nossos serviços', 'Prevenção a fraudes e segurança das operações'].map(item => (
                  <li key={item} className="text-white/55 text-sm pl-4 relative before:absolute before:left-0 before:content-['–'] before:text-[#CFA764] before:font-bold">{item}</li>
                ))}
              </ul>
            ),
          },
          {
            title: '4. Base Legal',
            content: (
              <ul className="space-y-1">
                {['Execução de contrato (Art. 7º, V da LGPD)', 'Consentimento do titular (Art. 7º, I)', 'Cumprimento de obrigação legal ou regulatória (Art. 7º, II)', 'Legítimo interesse (Art. 7º, IX)'].map(item => (
                  <li key={item} className="text-white/55 text-sm pl-4 relative before:absolute before:left-0 before:content-['–'] before:text-[#CFA764] before:font-bold">{item}</li>
                ))}
              </ul>
            ),
          },
          {
            title: '5. Compartilhamento de Dados',
            content: (
              <>
                <p className="text-white/55 text-sm leading-relaxed mb-3">Seus dados podem ser compartilhados com:</p>
                <ul className="space-y-1">
                  {['Seguradoras parceiras para fins de cotação e contratação', 'Plataformas tecnológicas (Google Firebase, Meta/WhatsApp Business API)', 'Órgãos reguladores (SUSEP, ANPD) quando exigido por lei', 'Prestadores de serviços sob contrato com cláusulas de proteção de dados'].map(item => (
                    <li key={item} className="text-white/55 text-sm pl-4 relative before:absolute before:left-0 before:content-['–'] before:text-[#CFA764] before:font-bold">{item}</li>
                  ))}
                </ul>
                <p className="text-white/55 text-sm leading-relaxed mt-3">Não vendemos, alugamos ou cedemos dados pessoais a terceiros para fins comerciais.</p>
              </>
            ),
          },
          {
            title: '6. Segurança dos Dados',
            content: (
              <p className="text-white/55 text-sm leading-relaxed">
                Adotamos medidas técnicas e organizacionais adequadas para proteger seus dados contra acesso não autorizado, perda, destruição ou divulgação indevida, incluindo criptografia em trânsito (TLS/HTTPS), controle de acesso por perfis e autenticação multifator nos sistemas internos.
              </p>
            ),
          },
          {
            title: '7. Retenção de Dados',
            content: (
              <p className="text-white/55 text-sm leading-relaxed">
                Mantemos seus dados pelo tempo necessário ao cumprimento das finalidades descritas nesta Política ou conforme exigido por lei. Dados de apólices são retidos por no mínimo 5 (cinco) anos após o encerramento do contrato, conforme regulamentação do setor de seguros. Após o prazo legal, os dados são excluídos ou anonimizados.
              </p>
            ),
          },
          {
            title: '8. Seus Direitos (LGPD, Art. 18)',
            content: (
              <ul className="space-y-1">
                {['Confirmação da existência de tratamento', 'Acesso aos dados pessoais', 'Correção de dados incompletos, inexatos ou desatualizados', 'Anonimização, bloqueio ou eliminação de dados desnecessários', 'Portabilidade dos dados a outro fornecedor de serviço', 'Eliminação dos dados tratados com base no consentimento', 'Revogação do consentimento a qualquer momento', 'Informação sobre o não fornecimento de consentimento e suas consequências'].map(item => (
                  <li key={item} className="text-white/55 text-sm pl-4 relative before:absolute before:left-0 before:content-['–'] before:text-[#CFA764] before:font-bold">{item}</li>
                ))}
              </ul>
            ),
          },
          {
            title: '9. Exercício dos Direitos',
            content: (
              <p className="text-white/55 text-sm leading-relaxed">
                Para exercer qualquer dos direitos acima, entre em contato pelo e-mail{' '}
                <a href="mailto:contato@michelinseguros.com.br" className="text-[#CFA764] hover:text-[#E8C97A]">contato@michelinseguros.com.br</a>
                {' '}ou WhatsApp <a href="https://wa.me/5567996748603" className="text-[#CFA764] hover:text-[#E8C97A]">(67) 99674-8603</a>.
                Solicitações de exclusão de dados: <Link to="/exclusao-de-dados" className="text-[#CFA764] hover:text-[#E8C97A]">clique aqui</Link>.
                Todas as solicitações são respondidas em até 15 dias úteis.
              </p>
            ),
          },
          {
            title: '10. Cookies e Tecnologias de Rastreio',
            content: (
              <p className="text-white/55 text-sm leading-relaxed">
                Nossa plataforma web utiliza cookies essenciais para autenticação e funcionamento do sistema. Utilizamos também ferramentas de análise de desempenho (Vercel Analytics e Speed Insights) para monitorar a qualidade do serviço. Não utilizamos cookies para fins de publicidade comportamental.
              </p>
            ),
          },
          {
            title: '11. Alterações nesta Política',
            content: (
              <p className="text-white/55 text-sm leading-relaxed">
                Esta Política pode ser atualizada periodicamente. A data da última revisão é sempre informada no topo da página. Alterações significativas serão comunicadas pelos nossos canais de atendimento.
              </p>
            ),
          },
          {
            title: '12. Contato e Encarregado (DPO)',
            content: (
              <div className="flex flex-wrap gap-3 mt-2">
                {[
                  { label: 'E-mail', value: 'contato@michelinseguros.com.br', href: 'mailto:contato@michelinseguros.com.br' },
                  { label: 'WhatsApp', value: '(67) 99674-8603', href: 'https://wa.me/5567996748603' },
                  { label: 'Endereço', value: 'Dourados, MS — Brasil' },
                ].map(item => (
                  <div key={item.label} className="flex items-center gap-2 bg-[#CFA764]/[0.06] border border-[#CFA764]/15 rounded-lg px-4 py-2.5">
                    <div>
                      <span className="block text-[10px] font-bold tracking-wide uppercase text-white/30">{item.label}</span>
                      {item.href
                        ? <a href={item.href} className="text-white font-semibold text-sm hover:text-[#CFA764] transition-colors">{item.value}</a>
                        : <span className="text-white font-semibold text-sm">{item.value}</span>
                      }
                    </div>
                  </div>
                ))}
              </div>
            ),
          },
        ].map(({ title, content }) => (
          <div key={title} className="bg-[#1a1a1a] border border-white/[0.08] rounded-2xl px-7 py-7 mb-4">
            <h2 className="text-[13px] font-black tracking-[0.15em] uppercase text-[#CFA764] mb-4 flex items-center gap-2 before:inline-block before:w-[3px] before:h-[14px] before:bg-[#CFA764] before:rounded-sm before:shrink-0">{title}</h2>
            {content}
          </div>
        ))}
      </main>

      <footer className="bg-[#111] border-t border-white/[0.08] px-6 py-8">
        <div className="max-w-3xl mx-auto flex flex-wrap gap-4 items-center justify-between">
          <p className="text-[11px] text-white/25">© 2026 Michelin Seguros Administradora e Corretora de Seguros Ltda<br />Dourados, MS · Brasil</p>
          <div className="flex gap-5 flex-wrap">
            <Link to="/politica-de-privacidade" className="text-[11px] font-semibold text-white/35 hover:text-[#CFA764] tracking-wide transition-colors">Política de Privacidade</Link>
            <Link to="/exclusao-de-dados" className="text-[11px] font-semibold text-white/35 hover:text-[#CFA764] tracking-wide transition-colors">Exclusão de Dados</Link>
            <a href="mailto:contato@michelinseguros.com.br" className="text-[11px] font-semibold text-white/35 hover:text-[#CFA764] tracking-wide transition-colors">Contato</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

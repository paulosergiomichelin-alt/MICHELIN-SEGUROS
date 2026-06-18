import React from 'react';
import { Link } from 'react-router-dom';

export default function ExclusaoDeDados() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans antialiased">
      <header className="bg-[#111] border-b border-white/[0.08] px-6 sticky top-0 z-50">
        <div className="max-w-3xl mx-auto h-[60px] flex items-center justify-between">
          <span className="text-[#CFA764] font-black text-[13px] tracking-[0.15em] uppercase">Michelin Seguros</span>
          <span className="text-[9px] font-bold tracking-[0.15em] uppercase text-white/30 bg-white/5 border border-white/[0.08] px-3 py-1 rounded-full">LGPD · Art. 18</span>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 pt-4 flex items-center gap-2 text-[11px] text-white/35 font-semibold tracking-wide">
        <Link to="/" className="hover:text-[#CFA764] transition-colors">Início</Link>
        <span>›</span>
        <span className="text-[#CFA764]">Exclusão de Dados</span>
      </div>

      <main className="max-w-3xl mx-auto px-6 py-8 pb-20">
        <div className="border-l-[3px] border-[#CFA764] pl-5 mb-10">
          <span className="inline-block text-[9px] font-black tracking-[0.2em] uppercase text-[#CFA764] bg-[#CFA764]/10 border border-[#CFA764]/25 px-2.5 py-1 rounded mb-3">Direitos do Titular · LGPD</span>
          <h1 className="text-3xl font-black text-white leading-tight tracking-tight mb-2">Exclusão de Dados Pessoais</h1>
          <p className="text-[11px] text-white/30 font-semibold tracking-wide uppercase">Atualizado em 17 de junho de 2026</p>
        </div>

        {/* Intro */}
        <div className="bg-[#1a1a1a] border border-white/[0.08] rounded-2xl px-7 py-7 mb-4">
          <h2 className="text-[13px] font-black tracking-[0.15em] uppercase text-[#CFA764] mb-4 flex items-center gap-2 before:inline-block before:w-[3px] before:h-[14px] before:bg-[#CFA764] before:rounded-sm before:shrink-0">Seu Direito à Exclusão</h2>
          <p className="text-white/55 text-sm leading-relaxed mb-2">
            A Lei Geral de Proteção de Dados (Lei nº 13.709/2018) garante a você o direito de solicitar a exclusão, anonimização ou bloqueio de dados desnecessários, excessivos ou tratados em desconformidade com a legislação.
          </p>
          <p className="text-white/55 text-sm leading-relaxed">
            A <strong className="text-white">Michelin Seguros Administradora e Corretora de Seguros Ltda</strong> respeita plenamente esse direito e processará sua solicitação em até <strong className="text-white">15 dias úteis</strong>.
          </p>
        </div>

        {/* Steps */}
        <div className="bg-[#1a1a1a] border border-white/[0.08] rounded-2xl px-7 py-7 mb-4">
          <h2 className="text-[13px] font-black tracking-[0.15em] uppercase text-[#CFA764] mb-4 flex items-center gap-2 before:inline-block before:w-[3px] before:h-[14px] before:bg-[#CFA764] before:rounded-sm before:shrink-0">Como Solicitar a Exclusão</h2>
          <div className="space-y-0 divide-y divide-white/[0.06]">
            {[
              { n: '1', title: 'Entre em contato', desc: <>Envie sua solicitação por e-mail para <a href="mailto:contato@michelinseguros.com.br" className="text-[#CFA764] hover:text-[#E8C97A]">contato@michelinseguros.com.br</a> ou WhatsApp <a href="https://wa.me/5567996748603" className="text-[#CFA764] hover:text-[#E8C97A]">(67) 99674-8603</a>, informando nome completo e CPF.</> },
              { n: '2', title: 'Confirmação de identidade', desc: 'Podemos solicitar documentos para verificar sua identidade e garantir que apenas o titular autorize a exclusão dos próprios dados.' },
              { n: '3', title: 'Processamento', desc: 'Após a confirmação, seus dados serão excluídos dos sistemas ativos dentro do prazo de 15 dias úteis. Você receberá confirmação por escrito.' },
              { n: '4', title: 'Confirmação de exclusão', desc: 'Enviaremos uma confirmação formal de que os dados foram excluídos, salvo nas hipóteses de retenção legalmente obrigatória.' },
            ].map(({ n, title, desc }) => (
              <div key={n} className="flex gap-4 py-4">
                <div className="w-8 h-8 rounded-full bg-[#CFA764]/12 border border-[#CFA764]/30 flex items-center justify-center text-[12px] font-black text-[#CFA764] shrink-0">{n}</div>
                <div>
                  <p className="text-sm font-bold text-white mb-1">{title}</p>
                  <p className="text-sm text-white/55">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="bg-gradient-to-br from-[#CFA764]/8 to-[#CFA764]/3 border border-[#CFA764]/25 rounded-2xl px-7 py-7 mb-4 text-center">
          <p className="text-base font-black text-white mb-2">Solicitar Exclusão Agora</p>
          <p className="text-sm text-white/55 mb-5">Clique abaixo para iniciar sua solicitação pelo WhatsApp ou envie um e-mail diretamente.</p>
          <a
            href="https://wa.me/5567996748603?text=Ol%C3%A1%2C%20gostaria%20de%20solicitar%20a%20exclus%C3%A3o%20dos%20meus%20dados%20pessoais."
            className="inline-block bg-[#CFA764] hover:bg-[#E8C97A] text-[#0a0a0a] text-xs font-black tracking-[0.1em] uppercase px-7 py-3 rounded-lg transition-colors no-underline"
          >
            Solicitar pelo WhatsApp
          </a>
        </div>

        {/* O que será excluído */}
        <div className="bg-[#1a1a1a] border border-white/[0.08] rounded-2xl px-7 py-7 mb-4">
          <h2 className="text-[13px] font-black tracking-[0.15em] uppercase text-[#CFA764] mb-4 flex items-center gap-2 before:inline-block before:w-[3px] before:h-[14px] before:bg-[#CFA764] before:rounded-sm before:shrink-0">O Que Será Excluído</h2>
          <ul className="space-y-1">
            {['Nome completo, CPF, RG e demais dados de identificação', 'Endereço, e-mail, telefone e WhatsApp', 'Dados de apólices de seguro contratadas', 'Histórico de atendimentos e comunicações', 'Dados coletados via integração com WhatsApp Business', 'Dados de navegação e interação com nossas plataformas digitais'].map(item => (
              <li key={item} className="text-white/55 text-sm pl-4 relative before:absolute before:left-0 before:content-['–'] before:text-[#CFA764] before:font-bold">{item}</li>
            ))}
          </ul>
        </div>

        {/* Exceções */}
        <div className="bg-[#1a1a1a] border border-white/[0.08] rounded-2xl px-7 py-7 mb-4">
          <h2 className="text-[13px] font-black tracking-[0.15em] uppercase text-[#CFA764] mb-4 flex items-center gap-2 before:inline-block before:w-[3px] before:h-[14px] before:bg-[#CFA764] before:rounded-sm before:shrink-0">Exceções à Exclusão</h2>
          <p className="text-white/55 text-sm leading-relaxed mb-3">Conforme o Art. 16 da LGPD, em determinadas hipóteses os dados podem ser mantidos:</p>
          <ul className="space-y-1 mb-4">
            {['Cumprimento de obrigação legal ou regulatória', 'Processos judiciais, administrativos ou arbitrais em andamento', 'Obrigações estabelecidas pelo SUSEP ou Receita Federal', 'Proteção ao crédito (conforme legislação pertinente)'].map(item => (
              <li key={item} className="text-white/55 text-sm pl-4 relative before:absolute before:left-0 before:content-['–'] before:text-[#CFA764] before:font-bold">{item}</li>
            ))}
          </ul>
          <div className="bg-[#CFA764]/6 border border-[#CFA764]/20 border-l-[3px] border-l-[#CFA764] rounded-r-lg px-4 py-3 text-[13px] text-white/60">
            Nos casos acima, informaremos quais dados não podem ser excluídos e o motivo legal que justifica a retenção.
          </div>
        </div>

        {/* Meta / WhatsApp */}
        <div className="bg-[#1a1a1a] border border-white/[0.08] rounded-2xl px-7 py-7 mb-4">
          <h2 className="text-[13px] font-black tracking-[0.15em] uppercase text-[#CFA764] mb-4 flex items-center gap-2 before:inline-block before:w-[3px] before:h-[14px] before:bg-[#CFA764] before:rounded-sm before:shrink-0">Dados Provenientes do WhatsApp e Meta</h2>
          <p className="text-white/55 text-sm leading-relaxed mb-2">
            Se você interagiu conosco por meio do <strong className="text-white">WhatsApp Business</strong> ou outras plataformas da Meta, podemos ter armazenado dados de contato e mensagens para fins de atendimento.
          </p>
          <p className="text-white/55 text-sm leading-relaxed">
            Ao solicitar a exclusão, removeremos esses dados de nossos sistemas internos. Para exclusão junto à Meta, acesse as configurações de privacidade do seu aplicativo WhatsApp.
          </p>
        </div>

        {/* Contato */}
        <div className="bg-[#1a1a1a] border border-white/[0.08] rounded-2xl px-7 py-7 mb-4">
          <h2 className="text-[13px] font-black tracking-[0.15em] uppercase text-[#CFA764] mb-4 flex items-center gap-2 before:inline-block before:w-[3px] before:h-[14px] before:bg-[#CFA764] before:rounded-sm before:shrink-0">Canais de Contato</h2>
          <div className="flex flex-wrap gap-3">
            {[
              { label: 'E-mail (DPO)', value: 'contato@michelinseguros.com.br', href: 'mailto:contato@michelinseguros.com.br' },
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
        </div>
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

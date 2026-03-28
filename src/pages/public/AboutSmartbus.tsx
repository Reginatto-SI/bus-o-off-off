import { Link } from "react-router-dom";
import { AlertCircle, ArrowRight, CheckCircle2, ClipboardList, ShieldCheck, Workflow } from "lucide-react";

import { PublicLayout } from "@/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";

const OPERATION_PAIN_POINTS = [
  "Planilhas espalhadas e sem atualização centralizada",
  "Controles improvisados para vendas e passageiros",
  "Erros no embarque por falta de visão da operação",
  "Retrabalho recorrente em conferência manual",
  "Dificuldade para acompanhar o que já foi vendido",
];

const PLATFORM_PROPOSAL = [
  "Vender passagens em um fluxo único",
  "Organizar passageiros com clareza",
  "Apoiar o embarque com mais praticidade",
  "Reduzir confusão operacional no dia a dia",
];

const TRUST_POINTS = [
  { icon: Workflow, title: "Fluxo simples e direto" },
  { icon: ClipboardList, title: "Estrutura pensada para uso real" },
  { icon: ShieldCheck, title: "Organização operacional com mais clareza" },
  { icon: CheckCircle2, title: "Plataforma focada em controle e praticidade" },
];

export default function AboutSmartbus() {
  return (
    // Esta rota estava "sem header" porque era renderizada fora do layout público compartilhado.
    <PublicLayout>
      <div className="mx-auto max-w-6xl space-y-12 px-4 py-14 sm:px-6 sm:py-16 lg:px-8">
        {/* Reaproveitamos o padrão público já existente e adicionamos retorno explícito para a landing institucional. */}
        <div>
          <Button asChild variant="ghost" className="gap-2 px-0 text-muted-foreground hover:text-foreground">
            <Link to="/">
              <ArrowRight className="h-4 w-4 rotate-180" />
              Voltar para a landing page
            </Link>
          </Button>
        </div>

        <section className="rounded-3xl border border-primary/20 bg-gradient-to-br from-card via-card to-primary/[0.05] p-6 sm:p-8">
          <p className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            Sobre a Smartbus BR
          </p>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Simplificando a venda de passagens e a gestão de embarques
          </h1>
          <p className="mt-4 max-w-3xl text-muted-foreground sm:text-lg">
            A Smartbus BR é uma plataforma criada para organizar vendas, passageiros e embarques de forma simples,
            segura e prática.
          </p>
        </section>

        {/* Estrutura em duas colunas para desktop, mantendo leitura rápida e escaneável. */}
        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
            <div className="inline-flex items-center gap-2 rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-600">
              <AlertCircle className="h-3.5 w-3.5" />
              Problema que resolvemos
            </div>
            <h2 className="mt-4 text-2xl font-bold text-foreground">O que ainda trava muitas operações</h2>
            <ul className="mt-5 space-y-3 text-sm text-muted-foreground sm:text-base">
              {OPERATION_PAIN_POINTS.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-[8px] h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-3xl border border-primary/20 bg-primary/5 p-6 shadow-sm">
            <p className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              Nossa proposta
            </p>
            <h2 className="mt-4 text-2xl font-bold text-foreground">Um único sistema para apoiar a operação</h2>
            <ul className="mt-5 space-y-3 text-sm text-muted-foreground sm:text-base">
              {PLATFORM_PROPOSAL.map((item) => (
                <li key={item} className="flex gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
          <h2 className="text-2xl font-bold text-foreground">Pensado para operação real</h2>
          <p className="mt-2 text-muted-foreground">
            A proposta da Smartbus BR é entregar uma estrutura clara e funcional para uso no dia a dia.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {TRUST_POINTS.map((point) => (
              <div key={point.title} className="rounded-2xl border border-border bg-muted/40 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <point.icon className="h-4 w-4 text-primary" />
                  {point.title}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-primary/20 bg-[hsl(222_47%_11%)] p-6 text-white sm:p-8">
          <h2 className="text-2xl font-bold">Pronto para começar com mais organização?</h2>
          <p className="mt-2 text-white/75">
            Crie seu evento, publique seu link de vendas e acompanhe a operação com mais previsibilidade.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button asChild className="gap-2">
              <Link to="/cadastro">
                Começar agora
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" className="border-white/20 bg-transparent text-white hover:bg-white/10">
              <Link to="/">
                Ver como funciona
              </Link>
            </Button>
          </div>
        </section>
      </div>
    </PublicLayout>
  );
}

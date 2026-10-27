import { ErrorState, LinkButton } from '../components/ui';

export function NotFoundPage() {
  return (
    <ErrorState
      title="Página não encontrada"
      message="O endereço pode estar incorreto ou a página foi removida."
      action={<LinkButton to="/">Ir para a vitrine</LinkButton>}
    />
  );
}

import { useState, type FormEvent } from 'react';
import { Button } from '../../components/ui/Button';
import { FormError } from '../../components/ui/Feedback';
import { InputField } from '../../components/ui/Fields';
import { Modal } from '../../components/ui/Modal';
import { formErrorMessage } from '../../lib/form-errors';
import { useUpdateInvestmentDetails } from './queries';

/** Metadado da posição (instituição/produto) — não afeta saldo nem rendimento. */
export function InvestmentDetailsFormModal({
  accountId,
  institution,
  product,
  onClose,
}: {
  accountId: string;
  institution: string | null;
  product: string | null;
  onClose: () => void;
}) {
  const update = useUpdateInvestmentDetails();
  const [institutionValue, setInstitutionValue] = useState(institution ?? '');
  const [productValue, setProductValue] = useState(product ?? '');
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    try {
      await update.mutateAsync({
        accountId,
        input: {
          institution: institutionValue.trim() || null,
          product: productValue.trim() || null,
        },
      });
      onClose();
    } catch (error) {
      setFormError(formErrorMessage(error));
    }
  }

  return (
    <Modal title="Instituição e produto" onClose={onClose}>
      <form noValidate onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
        <InputField
          label="Instituição (opcional)"
          value={institutionValue}
          onChange={(event) => setInstitutionValue(event.target.value)}
          maxLength={80}
          placeholder="Ex.: Banco X"
        />
        <InputField
          label="Produto (opcional)"
          value={productValue}
          onChange={(event) => setProductValue(event.target.value)}
          maxLength={80}
          placeholder="Ex.: CDB 120% CDI"
        />
        <FormError message={formError} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={update.isPending}>
            {update.isPending ? 'Salvando…' : 'Salvar'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

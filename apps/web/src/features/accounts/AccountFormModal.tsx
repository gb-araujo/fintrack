import { ACCOUNT_TYPES, accountNameSchema, type Account, type AccountType } from '@fintrack/shared';
import { useState, type FormEvent } from 'react';
import { Button } from '../../components/ui/Button';
import { FormError } from '../../components/ui/Feedback';
import { CheckboxField, InputField, MoneyField, SelectField } from '../../components/ui/Fields';
import { Modal } from '../../components/ui/Modal';
import { formErrorMessage } from '../../lib/form-errors';
import { centsToInput, parseMoneyInput } from '../../lib/money-input';
import { ACCOUNT_TYPE_LABEL } from '../ledger/labels';
import { useCreateAccount, useUpdateAccount } from '../ledger/queries';

interface Errors {
  name?: string;
  balance?: string;
}

/** Cria ou edita uma conta. O tipo só é escolhido na criação (o histórico depende dele). */
export function AccountFormModal({ account, onClose }: { account?: Account; onClose: () => void }) {
  const editing = account !== undefined;
  const [name, setName] = useState(account?.name ?? '');
  const [type, setType] = useState<AccountType>(account?.type ?? 'bank');
  const [balance, setBalance] = useState(account ? centsToInput(account.initialBalanceCents) : '');
  const [includeInAvailable, setIncludeInAvailable] = useState(account?.includeInAvailable ?? true);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const create = useCreateAccount();
  const update = useUpdateAccount();
  const submitting = create.isPending || update.isPending;

  function onTypeChange(next: AccountType) {
    setType(next);
    // Investimentos não entram no "dinheiro disponível" por padrão (a API aplica a mesma regra).
    setIncludeInAvailable(next !== 'investment');
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    const nextErrors: Errors = {};
    const parsedName = accountNameSchema.safeParse(name);
    if (!parsedName.success) nextErrors.name = parsedName.error.issues[0]?.message;
    const parsedBalance =
      balance.trim() === ''
        ? ({ ok: true, cents: 0 } as const)
        : parseMoneyInput(balance, { allowNegative: true, allowZero: true });
    if (!parsedBalance.ok) nextErrors.balance = parsedBalance.error;
    setErrors(nextErrors);
    if (!parsedName.success || !parsedBalance.ok) return;

    try {
      if (editing) {
        await update.mutateAsync({
          id: account.id,
          input: {
            name: parsedName.data,
            initialBalanceCents: parsedBalance.cents,
            includeInAvailable,
          },
        });
      } else {
        await create.mutateAsync({
          name: parsedName.data,
          type,
          initialBalanceCents: parsedBalance.cents,
          includeInAvailable,
        });
      }
      onClose();
    } catch (error) {
      setFormError(formErrorMessage(error));
    }
  }

  return (
    <Modal title={editing ? 'Editar conta' : 'Nova conta'} onClose={onClose}>
      <form noValidate onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
        <InputField
          label="Nome"
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={errors.name}
          placeholder="Ex.: Banco Inter"
          maxLength={60}
        />
        {!editing ? (
          <SelectField
            label="Tipo"
            value={type}
            onChange={(event) => onTypeChange(event.target.value as AccountType)}
            options={ACCOUNT_TYPES.map((value) => ({ value, label: ACCOUNT_TYPE_LABEL[value] }))}
          />
        ) : null}
        <MoneyField
          label="Saldo inicial"
          value={balance}
          onChange={(event) => setBalance(event.target.value)}
          error={errors.balance}
          hint="Saldo da conta antes de qualquer lançamento. Pode ser negativo (cheque especial)."
        />
        <CheckboxField
          label="Considerar no dinheiro disponível"
          checked={includeInAvailable}
          onChange={(event) => setIncludeInAvailable(event.target.checked)}
          hint="Contas de investimento normalmente ficam de fora."
        />
        <FormError message={formError} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Salvando…' : 'Salvar'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

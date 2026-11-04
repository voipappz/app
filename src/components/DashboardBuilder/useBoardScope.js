import { useAuth } from '../../context/AuthContext';
import { useCustomerEnvironment } from '../../context/CustomerEnvironmentContext.jsx';

// What a board's reports follow: the top bar's selection. A customer covers
// every one of its applications; a ROOT admin with nothing selected gets the
// fleet (every customer) rather than an empty board.
export function useBoardScope() {
  const { selectedCustomer, selectedEnvironments } = useCustomerEnvironment();
  const { isRoot } = useAuth();
  const environment = selectedEnvironments?.[0] || null;
  const fleet = Boolean(isRoot && !selectedCustomer?.uuid && !environment?.uuid);
  return {
    customerUuid: selectedCustomer?.uuid || null,
    environmentUuid: environment?.uuid || null,
    environmentUuids: (selectedEnvironments || []).map((env) => env?.uuid).filter(Boolean),
    fleet,
  };
}

export default useBoardScope;

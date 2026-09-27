import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TariffBridge } from './TariffBridge.jsx';

vi.mock('./TariffBridge.js', () => ({
  useTariffBridge: () => ({
    formData: { name: 'CallRates', scheme: 'flat', notes: 'Call rates for outbound calls', enabled: true },
    formErrors: {},
    handleChange: vi.fn(),
    schemes: ['flat'],
    schemesLoading: false,
    rates: [],
    ratesLoading: false,
    newRate: { name: '', price: '', val: '' },
    setNewRate: vi.fn(),
    editingRate: null,
    setEditingRate: vi.fn(),
    handleAddRate: vi.fn(),
    handleDeleteRate: vi.fn(),
    handleImportRates: vi.fn(),
    handleClearRates: vi.fn(),
    createTariff: vi.fn(),
    updateTariff: vi.fn(),
    loading: false,
    error: null,
    setError: vi.fn(),
  }),
}));

const gridOf = (element) => element.closest('.MuiGrid-root');

describe('TariffBridge', () => {
  // MUI v7 Grid only sizes through `size`; with the removed `item xs md`
  // props every field collapsed into one row.
  it('lays the tariff fields out on a sized grid', () => {
    render(<TariffBridge open mode="edit" tariff={{ uuid: 't-1' }} onClose={vi.fn()} onSave={vi.fn()} />);

    expect(gridOf(screen.getByLabelText(/^Name/))).toHaveClass('MuiGrid-grid-md-8');
    expect(gridOf(screen.getByLabelText('Notes'))).toHaveClass('MuiGrid-grid-xs-12');
    expect(gridOf(screen.getByLabelText('Enabled'))).toHaveClass('MuiGrid-grid-xs-12');
  });
});

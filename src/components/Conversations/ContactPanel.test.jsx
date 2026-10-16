import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '../../i18n';
import ContactPanel from './ContactPanel.jsx';
import { createMockApis, CONTACT_UUID } from './fixtures';

const h = vi.hoisted(() => ({ apis: null }));
vi.mock('../../services/api/contactsApi', () => ({ contactsApi: {
  lookup: (a) => h.apis.contactsApi.lookup(a), get: (a) => h.apis.contactsApi.get(a), fields: () => h.apis.contactsApi.fields(),
  update: vi.fn((a, b) => h.apis.contactsApi.update(a, b)), create: (a) => h.apis.contactsApi.create(a) } }));
import { contactsApi } from '../../services/api/contactsApi';

beforeEach(() => { h.apis = createMockApis(); vi.clearAllMocks(); });

describe('ContactPanel (mock data)', () => {
  it('renders name, defined fields by type, tags and previous conversations', async () => {
    render(<ContactPanel phone="0525550144" />);
    expect(await screen.findByText('Yael Cohen')).toBeInTheDocument();
    expect(await screen.findByText('Annual')).toBeInTheDocument();
    expect(screen.getByText('Cohen Ltd')).toBeInTheDocument();
    expect(screen.getByText('plan: gold')).toBeInTheDocument();
    expect(screen.getByText('renewal')).toBeInTheDocument();
    expect(screen.getAllByText(/^\d/).length).toBeGreaterThan(1);
  });

  it('edits a text field inline with a PATCH', async () => {
    render(<ContactPanel phone="0525550144" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Company' }));
    const input = screen.getByLabelText('Company');
    fireEvent.change(input, { target: { value: 'Cohen Group' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(contactsApi.update).toHaveBeenCalledWith(CONTACT_UUID, { field: 'company', value: 'Cohen Group' }));
    expect(await screen.findByText('Cohen Group')).toBeInTheDocument();
  });

  it('adds and removes a tag', async () => {
    render(<ContactPanel phone="0525550144" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Add tag' }));
    const input = screen.getByLabelText('key: value');
    fireEvent.change(input, { target: { value: 'vip: yes' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(contactsApi.update).toHaveBeenCalledWith(CONTACT_UUID, { meta: { vip: 'yes' } }));
    expect(await screen.findByText('vip: yes')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove tag renewal' }));
    await waitFor(() => expect(contactsApi.update).toHaveBeenCalledWith(CONTACT_UUID, { removeMeta: 'renewal' }));
    await waitFor(() => expect(screen.queryByText('renewal')).toBeNull());
  });

  it('offers to add a contact for an unknown number', async () => {
    render(<ContactPanel phone="0599999999" />);
    expect(await screen.findByText('No contact for this number.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add contact' }));
    expect(await screen.findByText('Phone')).toBeInTheDocument();
  });
});

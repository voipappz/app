import { Suspense } from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import RoutingScreen from './RoutingScreen.jsx';
import { pretendPhoneScreen } from '../../test/phoneScreen';

vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ isAuthenticated: true }) }));
vi.mock('../../context/UserAuthContext', () => ({ useUserAuth: () => ({ isAuthenticated: false }) }));
vi.mock('../PBXRouting/PBXRoutingView.jsx', () => ({ default: () => <div>workflow diagram</div> }));
vi.mock('./DIDs.jsx', () => ({ default: () => <div>routes list</div> }));

function Where() {
  const location = useLocation();
  return <div data-testid="where">{location.pathname + location.search}</div>;
}

const open = (url) => render(
  <MemoryRouter initialEntries={[url]}>
    <Suspense fallback={null}>
      <Routes>
        <Route path="/routes" element={<><RoutingScreen /><Where /></>} />
      </Routes>
    </Suspense>
  </MemoryRouter>,
);

let backToDesktop = () => {};
afterEach(() => { backToDesktop(); backToDesktop = () => {}; });

describe('/routes', () => {
  it('shows the list', async () => {
    open('/routes');
    expect(await screen.findByText('routes list')).toBeInTheDocument();
  });

  it("opens a route's workflow on a desktop", async () => {
    open('/routes?did=r1');
    expect(await screen.findByText('workflow diagram')).toBeInTheDocument();
  });

  it("opens the route's details instead of the workflow on a phone", async () => {
    backToDesktop = pretendPhoneScreen();
    open('/routes?did=r1');
    expect(await screen.findByText('routes list')).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/routes?route=r1');
    expect(screen.queryByText('workflow diagram')).not.toBeInTheDocument();
  });
});

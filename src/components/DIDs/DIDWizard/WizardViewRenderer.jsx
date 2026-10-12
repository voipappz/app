import { useRef } from 'react';
import DIDForm from '../DIDDialog/DIDForm';
import { IVRBridge } from '../../Bridges/IVRBridge/IVRBridge';
import { QueueBridge } from '../../Bridges/QueueBridge/QueueBridge';
import { AnnouncementBridge } from '../../Bridges/AnnouncementBridge/AnnouncementBridge.jsx';
import { VMLBridge } from '../../Bridges/VMLBridge/VMLBridge.jsx';
import { CallConditionBridge } from '../../Bridges/CallConditionBridge/CallConditionBridge.jsx';
import { BotBridge } from '../../Bridges/BotBridge/BotBridge.jsx';
import { ExtensionBridge } from '../../Bridges/ExtensionBridge/ExtensionBridge.jsx';

/**
 * WizardViewRenderer
 * Routes a wizard view to the correct form/bridge component.
 *
 * For the DID view, renders DIDForm inline.
 * For bridge views, renders the bridge component in panel mode (containerMode='panel').
 */
const WizardViewRenderer = ({
  view,
  bridgeTypes,
  bridgeResources,
  didTypes,
  onFetchBridgeResources,
  onSaveDID,
  onCancel,
  onDrillDown,
  loading,
}) => {
  // Every bridge editor, on saving, calls onSave and then onClose. Each would
  // go back one view, so saving went back two: past the editor that opened
  // this one (e.g. a new announcement made from a call condition landed on the
  // route). The first call ends this view; the second is ignored.
  const finished = useRef(false);
  const finish = (result = null) => {
    if (finished.current) return;
    finished.current = true;
    onCancel(result);
  };
  const close = () => finish(null);
  const save = (savedData) => finish(savedData);
  if (!view) return null;

  const { type, mode, data, environmentUuid } = view;

  switch (type) {
    case 'did':
      return (
        <DIDForm
          did={data}
          loading={loading}
          bridgeTypes={bridgeTypes}
          bridgeResources={bridgeResources}
          didTypes={didTypes}
          onFetchBridgeResources={onFetchBridgeResources}
          onSave={onSaveDID}
          onCancel={onCancel}
          onDrillDown={onDrillDown}
        />
      );

    case 'ivr':
      return (
        <IVRBridge
          open={true}
          onClose={close}
          onSave={save}
          environmentUuid={environmentUuid}
          ivr={data}
          mode={mode}
          hideEnvironment={true}
          containerMode="panel"
          onDrillDown={onDrillDown}
        />
      );

    case 'queue':
      return (
        <QueueBridge
          open={true}
          onClose={close}
          onSave={save}
          environmentUuid={environmentUuid}
          queue={data}
          mode={mode}
          hideEnvironment={true}
          containerMode="panel"
          onDrillDown={onDrillDown}
        />
      );

    case 'announcement':
      return (
        <AnnouncementBridge
          open={true}
          onClose={close}
          onSave={save}
          environmentUuid={environmentUuid}
          announcement={data}
          editMode={mode}
          hideEnvironment={true}
          containerMode="panel"
          onDrillDown={onDrillDown}
        />
      );

    case 'vml':
      return (
        <VMLBridge
          open={true}
          onClose={close}
          onSave={save}
          environmentUuid={environmentUuid}
          vml={data}
          mode={mode}
          hideEnvironment={true}
          containerMode="panel"
          onDrillDown={onDrillDown}
        />
      );

    case 'call_condition':
      return (
        <CallConditionBridge
          open={true}
          onClose={close}
          onSave={save}
          environmentUuid={environmentUuid}
          callCondition={data}
          mode={mode}
          hideEnvironment={true}
          containerMode="panel"
          onDrillDown={onDrillDown}
        />
      );

    case 'bot':
      return (
        <BotBridge
          open={true}
          onClose={close}
          onSave={save}
          environmentUuid={environmentUuid}
          bot={data}
          mode={mode}
          hideEnvironment={true}
          containerMode="panel"
          onDrillDown={onDrillDown}
        />
      );

    case 'extension':
      return (
        <ExtensionBridge
          open={true}
          onClose={close}
          onSave={save}
          environmentUuid={environmentUuid}
          extension={data}
          mode={mode}
          hideEnvironment={true}
          containerMode="panel"
          onDrillDown={onDrillDown}
        />
      );

    default:
      return null;
  }
};

export default WizardViewRenderer;

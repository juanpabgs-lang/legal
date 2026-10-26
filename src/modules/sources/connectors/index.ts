import type { Source } from '../../../db/schema';
import type { Connector } from '../types';
import { boampConnector } from './boamp';
import { bodaccConnector } from './bodacc';
import { boeConnector } from './boe';
import { bormeConnector } from './borme';
import { companiesHouseConnector } from './companies-house';
import { courtlistenerConnector } from './courtlistener';
import { edgarConnector } from './edgar';
import { federalRegisterConnector } from './federal-register';
import { findATenderConnector } from './find-a-tender';
import { gazetteConnector } from './gazette';
import { govukConnector } from './govuk';
import { placspConnector } from './placsp';
import { rssConnector } from './rss';
import { samConnector } from './sam';

export function getConnector(name: string, source: Source): Connector | null {
  switch (name) {
    case 'edgar':
      return edgarConnector;
    case 'federal-register':
      return federalRegisterConnector;
    case 'courtlistener':
      return courtlistenerConnector;
    case 'gazette':
      return gazetteConnector;
    case 'find-a-tender':
      return findATenderConnector;
    case 'govuk':
      return govukConnector;
    case 'bodacc':
      return bodaccConnector;
    case 'boamp':
      return boampConnector;
    case 'borme':
      return bormeConnector;
    case 'boe':
      return boeConnector;
    case 'placsp':
      return placspConnector;
    case 'rss':
      return rssConnector(source);
    case 'companies-house':
      return companiesHouseConnector;
    case 'sam':
      return samConnector;
    default:
      return null;
  }
}

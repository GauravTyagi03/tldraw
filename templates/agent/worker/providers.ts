import { getProviders, type ProviderEnv } from '../shared/providers/getProviders'
import type { Environment } from './environment'

/** Bridge Worker `Environment` bindings to the shared provider factory. */
export function getProvidersForEnv(env: Environment) {
	return getProviders(env as unknown as ProviderEnv)
}

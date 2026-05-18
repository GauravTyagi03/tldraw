import { getAssetUrlsByImport } from '@tldraw/assets/imports.vite'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { setDefaultEditorAssetUrls, setDefaultUiAssetUrls } from 'tldraw'
import App from './App'
import './index.css'

const assetUrls = getAssetUrlsByImport()
setDefaultEditorAssetUrls(assetUrls)
setDefaultUiAssetUrls(assetUrls)

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
	<React.StrictMode>
		<App />
	</React.StrictMode>
)

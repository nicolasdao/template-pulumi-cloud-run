/**
 * Copyright (c) 2019-2020, Cloudless Consulting Pty Ltd.
 * All rights reserved.
 * 
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree.
*/

const fs = require('fs')
const { join, sep } = require('path')

const HEAD_FILE = join(process.cwd(), '.git', 'HEAD')
const HEADS_FOLDER = join(process.cwd(), '.git', 'refs', 'heads')

const getBranch = () => {
	const gitExists = fs.existsSync(HEAD_FILE) && fs.existsSync(HEADS_FOLDER)
	if (!gitExists)
		return null

	const head = fs.readFileSync(HEAD_FILE).toString() || ''
	return (head.split(sep).reverse()[0] || '').replace(/\n/g, '')
}

const getCommitSha = () => {
	const branch = getBranch()
	if (!branch)
		return null

	const branchShaFile = join(HEADS_FOLDER, branch)
	if (!fs.existsSync(branchShaFile))
		return null

	return (fs.readFileSync(branchShaFile).toString() || '').replace(/\n/g, '')
}

const getCommitShortSha = () => {
	const commitSha = getCommitSha()
	if (!commitSha)
		return null
	else
		return commitSha.slice(0,7)
}

module.exports = {
	branch: getBranch,
	commitSha: getCommitSha,
	shortSha: getCommitShortSha
}








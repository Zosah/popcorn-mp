import { beforeEach, describe, expect, it, vi } from 'vitest'

import { chooseEditableImages } from '../../src/utils/image-editor'

const chooseMedia = vi.fn()
const editImage = vi.fn()
const cropImage = vi.fn()

beforeEach(() => {
  chooseMedia.mockReset()
  editImage.mockReset()
  cropImage.mockReset()
  vi.stubGlobal('wx', { chooseMedia, editImage, cropImage })
})

function pickOne(path = 'wxfile://tmp/a.jpg') {
  chooseMedia.mockImplementation((options: { success: (r: unknown) => void }) => {
    options.success({ tempFiles: [{ tempFilePath: path, size: 1024 }] })
  })
}

describe('选图链路', () => {
  it('编辑器失败时回退原图，不丢掉用户选择的照片', async () => {
    pickOne()
    editImage.mockImplementation((options: { fail: (r: { errMsg: string }) => void }) => {
      options.fail({ errMsg: 'editImage:fail file not found' })
    })

    const files = await chooseEditableImages({ count: 1 })
    expect(files).toHaveLength(1)
    expect(files[0].tempFilePath).toBe('wxfile://tmp/a.jpg')
  })

  it('用户在编辑器里取消时同样保留原图', async () => {
    pickOne()
    editImage.mockImplementation((options: { fail: (r: { errMsg: string }) => void }) => {
      options.fail({ errMsg: 'editImage:fail cancel' })
    })

    const files = await chooseEditableImages({ count: 1 })
    expect(files).toHaveLength(1)
    expect(files[0].tempFilePath).toBe('wxfile://tmp/a.jpg')
  })

  it('用户取消选图时返回空数组', async () => {
    chooseMedia.mockImplementation((options: { fail: (r: { errMsg: string }) => void }) => {
      options.fail({ errMsg: 'chooseMedia:fail cancel' })
    })

    await expect(chooseEditableImages({ count: 1 })).resolves.toEqual([])
  })

  it('需要方形裁剪时，裁剪失败会退回原图继续上传', async () => {
    pickOne()
    editImage.mockImplementation((options: { success: (r: { tempFilePath: string }) => void }) => {
      options.success({ tempFilePath: 'wxfile://tmp/edited.jpg' })
    })
    cropImage.mockImplementation((options: { fail: (r: { errMsg: string }) => void }) => {
      options.fail({ errMsg: 'cropImage:fail' })
    })

    const files = await chooseEditableImages({ count: 1, cropSquare: true })
    expect(files[0].tempFilePath).toBe('wxfile://tmp/a.jpg')
  })
})

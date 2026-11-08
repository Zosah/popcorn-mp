export interface ChosenImageFile {
  tempFilePath: string
  size: number
  width?: number
  height?: number
}

type EditImageApi = (options: {
  src: string
  success: (result: { tempFilePath: string }) => void
  fail: (result: { errMsg?: string }) => void
}) => void

type CropImageApi = (options: {
  src: string
  cropScale: '1:1'
  success: (result: { tempFilePath: string }) => void
  fail: (result: { errMsg?: string }) => void
}) => void

export class ImageEditCancelledError extends Error {
  constructor() {
    super('用户取消图片编辑')
    this.name = 'ImageEditCancelledError'
  }
}

export function isImageEditCancelled(error: unknown): boolean {
  return error instanceof ImageEditCancelledError
}

/** 选择原图，不启用微信的 compressed 选项，避免上传前先丢失细节。 */
export function chooseImageFiles(
  count: number,
  sourceType: Array<'album' | 'camera'> = ['album', 'camera'],
): Promise<ChosenImageFile[]> {
  return new Promise((resolve, reject) => {
    wx.chooseMedia({
      count,
      mediaType: ['image'],
      sourceType,
      // 上传前统一经过微信图片编辑器，选择阶段始终拿原图。
      sizeType: ['original'],
      success: (result) => resolve(result.tempFiles.map((file) => ({
        tempFilePath: file.tempFilePath,
        size: file.size,
        width: file.width,
        height: file.height,
      }))),
      fail: (error) => {
        if (isWxCancel(error.errMsg)) resolve([])
        else reject(error)
      },
    })
  })
}

/** 打开微信原生图片编辑器；用户取消时抛出可识别异常，不产生上传副作用。 */
export function editLocalImage(src: string): Promise<string> {
  const editImage = (wx as unknown as { editImage?: EditImageApi }).editImage
  if (!editImage) return Promise.resolve(src)
  return new Promise((resolve, reject) => {
    editImage({
      src,
      success: (result) => resolve(result.tempFilePath || src),
      fail: (result) => {
        if (isWxCancel(result.errMsg)) reject(new ImageEditCancelledError())
        else reject(new Error(result.errMsg || '图片编辑失败'))
      },
    })
  })
}

/** 头像类图片在选择后允许编辑，再裁成 1:1；旧基础库不支持裁剪时保留编辑结果。 */
export function cropSquareImage(src: string): Promise<string> {
  const cropImage = (wx as unknown as { cropImage?: CropImageApi }).cropImage
  if (!cropImage) return Promise.resolve(src)
  return new Promise((resolve, reject) => {
    cropImage({
      src,
      cropScale: '1:1',
      success: (result) => resolve(result.tempFilePath || src),
      fail: (result) => {
        if (isWxCancel(result.errMsg)) reject(new ImageEditCancelledError())
        else reject(new Error(result.errMsg || '图片裁剪失败'))
      },
    })
  })
}

/**
 * 统一的新图处理链路：选原图 -> 微信编辑器 -> 可选 1:1 裁剪。
 * 用户取消某一张时只跳过该张，不影响同批其他图片。
 */
export async function chooseEditableImages(options: {
  count: number
  cropSquare?: boolean
  sourceType?: Array<'album' | 'camera'>
}): Promise<ChosenImageFile[]> {
  const files = await chooseImageFiles(options.count, options.sourceType)
  const prepared: ChosenImageFile[] = []
  for (const file of files) {
    let tempFilePath = file.tempFilePath
    // 微信图片编辑器只是加分项：打不开、机型不支持、路径失效时都退回原图，
    // 不能因为「编辑」这一步失败就丢掉用户刚选的照片。
    try {
      tempFilePath = await editLocalImage(file.tempFilePath)
    } catch {
      tempFilePath = file.tempFilePath
    }
    if (options.cropSquare) {
      try {
        tempFilePath = await cropSquareImage(tempFilePath)
      } catch (error) {
        // 裁剪被取消或不可用时，保留上一步的结果，继续走上传。
        if (isImageEditCancelled(error)) continue
        tempFilePath = file.tempFilePath
      }
    }
    prepared.push({ ...file, tempFilePath })
  }
  return prepared
}

/** 已有图片编辑：先下载展示图，再进入同一编辑器；调用方负责重新上传并替换 mediaId。 */
export async function editRemoteImage(url: string): Promise<string> {
  if (!url) throw new Error('没有可编辑的图片')
  const localPath = await downloadImage(url)
  return editLocalImage(localPath)
}

export function downloadImage(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    wx.downloadFile({
      url,
      timeout: 30000,
      success: (result) => {
        if (result.statusCode >= 200 && result.statusCode < 300 && result.tempFilePath) {
          resolve(result.tempFilePath)
          return
        }
        reject(new Error(`图片下载失败（${result.statusCode}）`))
      },
      fail: (error) => reject(new Error(error.errMsg || '图片下载失败')),
    })
  })
}

function isWxCancel(message: string | undefined): boolean {
  return /cancel/i.test(message ?? '')
}

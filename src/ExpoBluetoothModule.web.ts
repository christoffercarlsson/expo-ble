/// <reference types="web-bluetooth" />

import { EventEmitter } from 'expo-modules-core'
import { createFrom } from 'stedy'

const ERROR_NOT_IMPLEMENTED = 0
const ERROR_BLUETOOTH_UNAVAILABLE = 1

type Device = {
  uuid: string
  name: string
  rssi: number
}

type ReadyHandler = () => void

type DiscoverHandler = (device: string, name: string, rssi: number) => void

type ConnectHandler = (device: string) => void

type DisconnectHandler = (device: string) => void

type ChangeHandler = (
  device: string,
  characteristic: string,
  value: Uint8Array
) => void

type WriteHandler = (
  device: string,
  characteristic: string,
  value: Uint8Array
) => void

type ErrorHandler = (code: number, reason: string, device: string) => void

class DeviceManager {
  private onReady: ReadyHandler
  private onDiscover: DiscoverHandler
  private onConnect: ConnectHandler
  private onDisconnect: DisconnectHandler
  private onChange: ChangeHandler
  private onWrite: WriteHandler
  private onError: ErrorHandler

  private bluetoothAvailable: boolean
  private isScanning: boolean
  private reconnect: boolean

  private gattServer?: BluetoothRemoteGATTServer
  private device?: Device
  private characteristics: Map<string, BluetoothRemoteGATTCharacteristic>

  constructor({
    onReady,
    onDiscover,
    onConnect,
    onDisconnect,
    onChange,
    onWrite,
    onError
  }: {
    onReady: ReadyHandler
    onDiscover: DiscoverHandler
    onConnect: ConnectHandler
    onDisconnect: DisconnectHandler
    onChange: ChangeHandler
    onWrite: WriteHandler
    onError: ErrorHandler
  }) {
    this.onReady = onReady
    this.onDiscover = onDiscover
    this.onConnect = onConnect
    this.onDisconnect = onDisconnect
    this.onChange = onChange
    this.onWrite = onWrite
    this.onError = onError
    this.bluetoothAvailable = 'bluetooth' in navigator
    this.isScanning = false
    this.reconnect = false
    this.characteristics = new Map([])
  }

  private deviceError(code: number, reason: string, device?: Device) {
    this.onError(code, reason, device ? device.uuid : '')
  }

  private managerError(code: number, reason: string) {
    this.deviceError(code, reason, undefined)
  }

  private notImplemented(fn: string) {
    this.managerError(ERROR_NOT_IMPLEMENTED, `${fn} is not implemented yet`)
  }

  private bluetoothUnavailable() {
    this.managerError(ERROR_BLUETOOTH_UNAVAILABLE, 'Bluetooth unavailable')
  }

  private deviceConnected(device: BluetoothDevice) {
    this.device = { uuid: device.id, name: device.name || 'Unkown', rssi: -42 }
    this.onDiscover(this.device.uuid, this.device.name, this.device.rssi)
    this.onConnect(this.device.uuid)
  }

  private valueChanged(characteristic: string, value: BufferSource) {
    console.log('value changed', characteristic, value)
    if (this.device) {
      this.onChange(
        this.device.uuid,
        characteristic,
        new Uint8Array(createFrom(value))
      )
    }
  }

  private valueWritten(characteristic: string, value: Uint8Array) {
    if (this.device) {
      this.onWrite(this.device.uuid, characteristic, value)
    }
  }

  private async discoverCharacteristics(serviceUUID: string) {
    const service = await this.gattServer?.getPrimaryService(serviceUUID)
    const characteristics = (await service?.getCharacteristics()) || []
    characteristics.forEach((characteristic) => {
      this.characteristics.set(characteristic.uuid, characteristic)
    })
  }

  private async requestDevice(services: string[], reconnect: boolean) {
    this.isScanning = true
    this.reconnect = reconnect
    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services }]
      })
      this.gattServer = await device.gatt?.connect()
      await Promise.all(
        services.map((service) => this.discoverCharacteristics(service))
      )
      this.deviceConnected(device)
    } finally {
      this.isScanning = false
    }
  }

  start() {
    if (this.bluetoothAvailable) {
      this.onReady()
    } else {
      this.bluetoothUnavailable()
    }
  }

  startAdvertising(name: string, servicesJSON: string) {
    this.notImplemented('startAdvertising')
  }

  stopAdvertising() {
    this.notImplemented('stopAdvertising')
  }

  startScanning(services: string[], reconnect: boolean) {
    if (!this.isScanning) {
      this.characteristics.clear()
      this.isScanning = true
      this.requestDevice(services, reconnect)
    }
  }

  stopScanning() {
    this.isScanning = false
  }

  connect(device: string, reconnect: boolean) {
    this.notImplemented('connect')
  }

  disconnect() {
    this.characteristics.clear()
    this.isScanning = false
    if (this.gattServer?.connected) {
      this.gattServer.disconnect()
    }
    if (this.device) {
      this.onDisconnect(this.device.uuid)
    }
  }

  read(device: string, characteristic: string) {
    this.characteristics
      .get(characteristic)
      ?.readValue()
      .then((value) => {
        this.valueChanged(characteristic, value)
      })
  }

  async subscribe(device: string, characteristic: string) {
    const c = this.characteristics.get(characteristic)
    await c?.startNotifications()
    c?.addEventListener('characteristicvaluechanged', (event) => {
      console.log(event)
      // @ts-ignore
      this.valueChanged(characteristic, event.target.value)
    })
  }

  unsubscribe(device: string, characteristic: string) {
    return this.characteristics.get(characteristic)?.stopNotifications()
  }

  write(
    device: string,
    characteristic: string,
    value: Uint8Array,
    withResponse: boolean
  ) {
    if (withResponse) {
      this.characteristics
        .get(characteristic)
        ?.writeValueWithResponse(value.buffer)
    } else {
      this.characteristics
        .get(characteristic)
        ?.writeValueWithoutResponse(value.buffer)
    }
    this.valueWritten(characteristic, value)
  }

  set(characteristic: string, value: Uint8Array) {
    this.notImplemented('set')
  }
}

const emitter = new EventEmitter({} as any)

const deviceManager = new DeviceManager({
  onReady: () => {
    emitter.emit('onReady')
  },
  onDiscover: (device: string, name: string, rssi: number) => {
    emitter.emit('onDiscover', { device, name, rssi })
  },
  onConnect: (device: string) => {
    emitter.emit('onConnect', { device })
  },
  onDisconnect: (device: string) => {
    emitter.emit('onDisconnect', { device })
  },
  onChange: (device: string, characteristic: string, value: Uint8Array) => {
    emitter.emit('onChange', { device, characteristic, value })
  },
  onWrite: (device: string, characteristic: string, value: Uint8Array) => {
    emitter.emit('onWrite', { device, characteristic, value })
  },
  onError: (code: number, reason: string, device: string) => {
    emitter.emit('onError', { code, reason, device })
  }
})

export default {
  start() {
    return deviceManager.start()
  },
  startAdvertising(name: string, servicesJSON: string) {
    return deviceManager.startAdvertising(name, servicesJSON)
  },
  stopAdvertising() {
    return deviceManager.stopAdvertising()
  },
  startScanning(services: string[], reconnect: boolean) {
    return deviceManager.startScanning(services, reconnect)
  },
  stopScanning() {
    return deviceManager.stopScanning()
  },
  connect(device: string, reconnect: boolean) {
    return deviceManager.connect(device, reconnect)
  },
  disconnect(device: string) {
    return deviceManager.disconnect()
  },
  read(device: string, characteristic: string) {
    return deviceManager.read(device, characteristic)
  },
  subscribe(device: string, characteristic: string) {
    return deviceManager.subscribe(device, characteristic)
  },
  unsubscribe(device: string, characteristic: string) {
    return deviceManager.unsubscribe(device, characteristic)
  },
  write(
    device: string,
    characteristic: string,
    value: Uint8Array,
    withResponse: boolean
  ) {
    return deviceManager.write(device, characteristic, value, withResponse)
  },
  set(characteristic: string, value: Uint8Array) {
    return deviceManager.set(characteristic, value)
  }
}
